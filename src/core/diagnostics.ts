/**
 * Pure CDN validation logic, independent of the VSCode API so it can be
 * unit-tested directly. Positions are 0-based character offsets into the
 * source text; the extension layer converts them to editor positions.
 */
import { CBOR, CdnSyntaxError, type ParseWarning } from '@cbortech/cbor';
import {
  CborArray,
  CborEmbeddedCBOR,
  CborIndefiniteByteString,
  CborIndefiniteTextString,
  CborMap,
  CborTag,
  CborTextString,
  type CborItem,
} from '@cbortech/cbor/ast';
import { tokenizeLenient } from '@cbortech/cbor/cdn';
import {
  disabledExtensionForPrefix,
  resolveExtensions,
  type ExtensionSettings,
} from './extensions';

/**
 * CBOR tag for an unrecognized CDN application extension (CPA999,
 * draft-ietf-cbor-edn-literals §6.5). The parser wraps any app-string /
 * app-sequence literal whose prefix has no matching extension in this tag
 * instead of failing (`unresolvedExtension: 'cpa999'`, the default).
 */
const CPA999_TAG = 999n;

export type TopLevelMode = 'item' | 'sequence';

export interface CdnDiagnostic {
  message: string;
  /**
   * `info` marks an informational hint (`ParseWarning.hint`) — e.g. an
   * app-string prefix matching a known but unregistered extension — rather
   * than a validity violation.
   */
  severity: 'error' | 'warning' | 'info';
  /** Character offset of the start of the offending range. */
  start: number;
  /** Character offset just past the end of the offending range. */
  end: number;
}

/**
 * Validate CDN text and return diagnostics.
 *
 * - `item` mode: the document must contain exactly one CDN data item
 *   (application/cdn media type).
 * - `sequence` mode: the document may contain any number of items separated
 *   by whitespace, commas, or comments.
 */
export function validateCdn(
  text: string,
  mode: TopLevelMode,
  extensionSettings?: ExtensionSettings
): CdnDiagnostic[] {
  // An empty / comments-only document produces no diagnostics: transient
  // states while typing should not be flagged as broken documents.
  const scan = tokenizeLenient(text);
  if (scan.tokens.length === 0 && scan.error === undefined) return [];

  const diagnostics: CdnDiagnostic[] = [];
  const onWarning = (w: ParseWarning): void => {
    diagnostics.push(warningToDiagnostic(w, text));
  };
  const { builtinExtensions, extensions } =
    resolveExtensions(extensionSettings);
  const options = {
    strict: false as const,
    silent: true,
    onWarning,
    builtinExtensions,
    extensions,
  };

  try {
    const roots: CborItem[] =
      mode === 'item'
        ? [CBOR.fromCDN(text, options)]
        : [...CBOR.fromCDNSeq(text, options)];

    // Known extension prefixes that a user disabled but that the bundled
    // @cbortech/cbor missing-extension hint table doesn't cover (e.g. `SET`
    // / `MAP` from @cbortech/set-map-extensions) parse silently to an
    // unresolved tag-999 node with no onWarning call. Walk the parsed tree
    // to catch those; ranges already reported via onWarning (the extensions
    // the library *does* know about) are skipped to avoid duplicates.
    for (const root of roots) {
      for (const d of collectDisabledExtensionDiagnostics(
        root,
        extensionSettings
      )) {
        if (!diagnostics.some((e) => e.start === d.start && e.end === d.end)) {
          diagnostics.push(d);
        }
      }
    }
  } catch (e) {
    diagnostics.push(errorToDiagnostic(e, text));
  }

  return dedupe(diagnostics);
}

/**
 * Recursively find app-string / app-sequence literals that resolved to an
 * unrecognized-extension (tag 999) node solely because their extension was
 * disabled via `cdn.extensions.*`, and turn each into a diagnostic.
 */
function collectDisabledExtensionDiagnostics(
  root: CborItem,
  settings: ExtensionSettings | undefined
): CdnDiagnostic[] {
  const found: CdnDiagnostic[] = [];
  const visit = (node: CborItem): void => {
    if (node instanceof CborTag) {
      if (
        node.tag === CPA999_TAG &&
        node.content instanceof CborArray &&
        node.content.items[0] instanceof CborTextString &&
        node.start !== undefined &&
        node.end !== undefined
      ) {
        const prefix = node.content.items[0].value;
        const name = disabledExtensionForPrefix(prefix, settings);
        if (name !== undefined) {
          found.push({
            message: `app-string prefix '${prefix}' requires the '${name}' extension, which is disabled via the "cdn.extensions.${name}" setting`,
            // Same class as the library's own missing-extension hints
            // (ParseWarning.hint): informational, not a validity violation.
            severity: 'info',
            start: node.start,
            end: node.end,
          });
        }
      }
      visit(node.content);
      return;
    }
    if (node instanceof CborArray || node instanceof CborEmbeddedCBOR) {
      for (const item of node.items) visit(item);
      return;
    }
    if (node instanceof CborMap) {
      for (const [key, value] of node.entries) {
        visit(key);
        visit(value);
      }
      return;
    }
    if (
      node instanceof CborIndefiniteByteString ||
      node instanceof CborIndefiniteTextString
    ) {
      for (const chunk of node.chunks) visit(chunk);
      return;
    }
  };
  visit(root);
  return found;
}

function warningToDiagnostic(w: ParseWarning, text: string): CdnDiagnostic {
  // A fatal warning means non-strict sequence parsing abandoned the rest of
  // the input: everything after it is unanalyzed, not clean. Surface it as an
  // error and say so, since no further diagnostics will follow it.
  const message = w.fatal
    ? `${w.message} (the rest of the document was not parsed)`
    : w.message;
  return {
    message,
    severity: w.fatal ? 'error' : w.hint ? 'info' : 'warning',
    ...resolveRange(text, w.offset, w.endOffset),
  };
}

function errorToDiagnostic(e: unknown, text: string): CdnDiagnostic {
  if (e instanceof CdnSyntaxError && e.offset !== undefined) {
    return {
      message: e.message,
      severity: 'error',
      ...resolveRange(text, e.offset, e.endOffset),
    };
  }
  const message = e instanceof Error ? e.message : String(e);
  return { message, severity: 'error', ...resolveRange(text, 0, undefined) };
}

/**
 * Turn a (possibly partial) source position into a visible underline range.
 *
 * - Both offsets present and non-empty: use [offset, endOffset) as-is.
 * - Zero-width (offset === endOffset, typically an EOF-anchored error such as
 *   an unterminated string literal): widen to one character — forward when
 *   possible, otherwise backward over the last character of the document.
 * - No endOffset (some warnings only carry a start offset): underline the run
 *   of non-blank characters starting at offset, at least one character.
 */
function resolveRange(
  text: string,
  offset: number | undefined,
  endOffset: number | undefined
): { start: number; end: number } {
  const start = offset ?? 0;
  let end: number;
  if (endOffset !== undefined && endOffset > start) {
    end = endOffset;
  } else if (endOffset !== undefined) {
    end = start; // zero-width; widened below
  } else {
    end = start;
    while (end < text.length && !/[\s,\]})]/.test(text[end])) end++;
  }
  if (end <= start) {
    if (start < text.length) return { start, end: start + 1 };
    if (start > 0) return { start: start - 1, end: start };
    return { start: 0, end: 0 }; // empty document
  }
  return { start, end };
}

function dedupe(diagnostics: CdnDiagnostic[]): CdnDiagnostic[] {
  const seen = new Set<string>();
  return diagnostics.filter((d) => {
    const key = `${d.start}:${d.end}:${d.severity}:${d.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
