/**
 * Pure CDN validation logic, independent of the VSCode API so it can be
 * unit-tested directly. Positions are 0-based character offsets into the
 * source text; the extension layer converts them to editor positions.
 */
import { CBOR, CdnSyntaxError, type ParseWarning } from '@cbortech/cbor';
import { tokenizeLenient } from '@cbortech/cbor/cdn';

export type TopLevelMode = 'item' | 'sequence';

export interface CdnDiagnostic {
  message: string;
  severity: 'error' | 'warning';
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
export function validateCdn(text: string, mode: TopLevelMode): CdnDiagnostic[] {
  // An empty / comments-only document produces no diagnostics: transient
  // states while typing should not be flagged as broken documents.
  const scan = tokenizeLenient(text);
  if (scan.tokens.length === 0 && scan.error === undefined) return [];

  const diagnostics: CdnDiagnostic[] = [];
  const onWarning = (w: ParseWarning): void => {
    diagnostics.push(warningToDiagnostic(w, text));
  };

  try {
    if (mode === 'item') {
      CBOR.fromCDN(text, { strict: false, silent: true, onWarning });
    } else {
      // Drain the generator; diagnostics arrive through onWarning.
      for (const item of CBOR.fromCDNSeq(text, {
        strict: false,
        silent: true,
        onWarning,
      })) {
        void item;
      }
    }
  } catch (e) {
    diagnostics.push(errorToDiagnostic(e, text));
  }

  return dedupe(diagnostics);
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
    severity: w.fatal ? 'error' : 'warning',
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
