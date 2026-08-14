/**
 * Pure CDN formatting logic, independent of the VSCode API.
 *
 * Safety model: the formatter only rewrites documents it can parse cleanly,
 * and it verifies that the formatted output encodes to exactly the same CBOR
 * bytes (and keeps at least as many comments) before returning it. On any
 * doubt it returns `null`, which the extension surfaces as "no edits".
 */
import { CBOR, type FromCDNOptions, type ToCDNOptions } from '@cbortech/cbor';
import type { CborItem } from '@cbortech/cbor/ast';
import { tokenizeLenient } from '@cbortech/cbor/cdn';
import type { TopLevelMode } from './diagnostics';
import { resolveExtensions, type ExtensionSettings } from './extensions';

export interface FormatSettings {
  topLevel: TopLevelMode;
  /**
   * Resolved indentation string, e.g. '  ' or '\t'. An empty string yields
   * single-line output (the serializer strips comments there, so documents
   * with comments refuse to format unless `comments` is 'strip').
   */
  indent: string;
  commas: 'comma' | 'none' | 'trailing';
  comments: 'preserve' | 'c-style' | 'cdn-style' | 'strip';
  encodingIndicators: 'always' | 'auto' | 'never';
  /** Prefer app-prefix notation (`dt'…'`, `dt<<…>>`) over raw tag notation. */
  appPrefix: boolean;
  bstrEncoding: 'hex' | 'base64' | 'base64url';
  preserveByteString: boolean;
  /** Keep the original spelling of raw backtick string literals. */
  preserveRawString: boolean;
  /** Keep the original spelling of integer and floating-point literals. */
  preserveNumberFormat: boolean;
  /** Keep the original notation (quoting/bracketing/raw tag) of extension app-prefix literals. */
  preserveAppPrefix: boolean;
  /** Re-emit a blank line above an entry that had one in the source. */
  preserveBlankLines: boolean;
  /** Keep `"a" + "b"` concatenation chains from the source. */
  preserveConcatenation: boolean;
  /** Split strings whose content parses as CDN, with structure-aware indent. */
  splitCdn: boolean;
  /** Split strings at newline characters using `+` concatenation. */
  splitNewline: boolean;
  /** Keep containers without nested containers on one line, e.g. `[1, 2, 3]`. */
  inlineLeafContainers: boolean;
  /**
   * Numeric format for floating-point values. Only takes effect where the
   * original spelling isn't otherwise being kept: for a plain decimal/hex
   * float literal, `preserveNumberFormat` wins whenever it's on; for a
   * `float'…'` app-string literal, leaving this unset (or `'app-extension'`)
   * keeps its original bit-pattern spelling, while `'decimal'`/`'hex'`
   * actively renormalizes it, which loses non-canonical bit patterns like a
   * NaN payload. Leave unset for the safe default; opt in explicitly.
   */
  floatFormat?: 'decimal' | 'hex' | 'app-extension';
  /** Render `+` concatenation / elision chains as `t1<<…>>` / `b1<<…>>` app-sequence notation. */
  modernConcat: boolean;
  /** Render indefinite-length strings as `ilts<<…>>` / `ilbs<<…>>` app-sequence notation. */
  modernStreamSyntax: boolean;
  /** Per-extension enable/disable state; missing entries mean enabled. */
  extensions?: ExtensionSettings;
}

export function formatCdn(text: string, s: FormatSettings): string | null {
  if (text.trim() === '') return null;

  const preserveComments = s.comments !== 'strip';
  const { builtinExtensions, extensions } = resolveExtensions(s.extensions);
  // strict: any validity violation aborts formatting (throws).
  const fromOptions: FromCDNOptions = {
    strict: true,
    silent: true,
    preserveComments,
    builtinExtensions,
    extensions,
  };
  const toOptions: ToCDNOptions = {
    indent: s.indent,
    // preserveComments is the verbatim switch; comments picks the
    // normalized marker style when it's off (the deprecated string-valued
    // preserveComments shorthand collapsed both into one option).
    preserveComments: s.comments === 'preserve',
    comments: s.comments === 'preserve' ? undefined : s.comments,
    preserveByteString: s.preserveByteString,
    preserveRawString: s.preserveRawString,
    preserveNumberFormat: s.preserveNumberFormat,
    preserveAppPrefix: s.preserveAppPrefix,
    preserveBlankLines: s.preserveBlankLines,
    preserveConcatenation: s.preserveConcatenation,
    splitCdn: s.splitCdn,
    splitNewline: s.splitNewline,
    inlineLeafContainers: s.inlineLeafContainers,
    commas: s.commas,
    encodingIndicators: s.encodingIndicators,
    appPrefix: s.appPrefix,
    bstrEncoding: s.bstrEncoding,
    floatFormat: s.floatFormat,
    modernConcat: s.modernConcat,
    modernStreamSyntax: s.modernStreamSyntax,
  };

  let formatted: string;
  try {
    formatted =
      s.topLevel === 'item'
        ? CBOR.fromCDN(text, fromOptions).toCDN(toOptions)
        : formatSequence(text, fromOptions, toOptions);
  } catch {
    return null;
  }

  if (!formatted.endsWith('\n')) formatted += '\n';
  if (!verifyRoundTrip(text, formatted, s, { builtinExtensions, extensions }))
    return null;
  return formatted;
}

function formatSequence(
  text: string,
  fromOptions: FromCDNOptions,
  toOptions: ToCDNOptions
): string {
  const items: CborItem[] = [...CBOR.fromCDNSeq(text, fromOptions)];
  if (items.length === 0) throw new Error('no items');

  const parts = items.map((item) => item.toCDN(toOptions));

  // fromCDNSeq drops comments that follow the last item on later lines
  // (they belong to no item). Re-attach them verbatim so formatting never
  // loses a comment.
  if (fromOptions.preserveComments) {
    const lastEnd = items[items.length - 1].end ?? text.length;
    const tail = text.slice(lastEnd);
    const scan = tokenizeLenient(tail);
    for (const c of scan.comments) {
      // Comments on the same line as the last item were already attached to
      // it as trailing comments; only comments after a newline are orphans.
      if (tail.slice(0, c.start).includes('\n')) {
        parts.push(tail.slice(c.start, c.end).trimEnd());
      }
    }
  }

  return parts.join('\n');
}

/**
 * The formatted text must parse back to the same data as the original
 * (compared through a canonical single-line re-serialization, which also
 * works for documents containing `...` elisions that cannot be encoded to
 * CBOR bytes), and — when the settings promise losslessness — keep every
 * comment.
 */
function verifyRoundTrip(
  original: string,
  formatted: string,
  s: FormatSettings,
  parseExtensions: Pick<FromCDNOptions, 'builtinExtensions' | 'extensions'>
): boolean {
  // Fixed options so the comparison is independent of the user's style
  // settings; comments are stripped from the comparison on purpose. Both
  // sides must be parsed with the same extension set as the formatting pass,
  // otherwise extension literals would compare as different node types.
  // floatFormat is pinned to 'app-extension' (not 'decimal'): it derives its
  // spelling from the value's actual encoded bytes rather than its source
  // text, so it renders deterministically regardless of whether either side
  // happens to carry a float'...' source spelling (avoiding a false
  // mismatch when `floatFormat: 'app-extension'` turns a plain-decimal
  // original into float'...' notation) — and, unlike 'decimal', it also
  // keeps NaN payloads and ±Infinity distinguishable, so a lossy rewrite
  // that collapses two different NaN payloads to the same "NaN" text is
  // still caught as a mismatch here.
  const canonicalOptions: ToCDNOptions = {
    encodingIndicators: 'always',
    floatFormat: 'app-extension',
  };
  const parseOptions: FromCDNOptions = {
    strict: false,
    silent: true,
    ...parseExtensions,
  };
  try {
    const canonicalOf = (text: string): string =>
      s.topLevel === 'item'
        ? CBOR.fromCDN(text, parseOptions).toCDN(canonicalOptions)
        : [...CBOR.fromCDNSeq(text, parseOptions)]
            .map((item) => item.toCDN(canonicalOptions))
            .join(' ');
    if (canonicalOf(original) !== canonicalOf(formatted)) return false;

    const commentCount = (text: string): number =>
      tokenizeLenient(text).comments.length;
    // Single-line output (empty indent) cannot carry comments at all — the
    // serializer strips every one of them. Any comment in the source would be
    // silently deleted, so refuse regardless of preserveByteString (whose only
    // role in the check below is to excuse comments inside byte strings).
    if (s.indent === '' && s.comments !== 'strip' && commentCount(original) > 0)
      return false;
    // Byte-string and app-sequence literals (e.g. h'…', DT<<…>>) can carry
    // comments baked into their interior spelling; the comment is only
    // guaranteed to survive when both the corresponding preserve* option and
    // preserveComments are on, so only check comment counts in that case.
    if (
      s.comments === 'preserve' &&
      (s.preserveByteString || s.preserveAppPrefix)
    ) {
      if (commentCount(formatted) < commentCount(original)) return false;
    }
    return true;
  } catch {
    return false;
  }
}
