/**
 * Pure CDN formatting logic, independent of the VSCode API.
 *
 * Safety model: the formatter only rewrites documents it can parse cleanly,
 * and it verifies that the formatted output encodes to exactly the same CBOR
 * bytes (and keeps at least as many comments) before returning it. On any
 * doubt it returns `null`, which the extension surfaces as "no edits".
 */
import { CBOR, type ToCDNOptions } from '@cbortech/cbor';
import type { CborItem } from '@cbortech/cbor/ast';
import { tokenizeLenient } from '@cbortech/cbor/cdn';
import type { TopLevelMode } from './diagnostics';

export interface FormatSettings {
  topLevel: TopLevelMode;
  /** Resolved indentation string, e.g. '  ' or '\t'. */
  indent: string;
  commas: 'comma' | 'none' | 'trailing';
  comments: 'preserve' | 'c-style' | 'cdn-style' | 'strip';
  encodingIndicators: 'always' | 'auto' | 'never';
  appStrings: boolean;
  bstrEncoding: 'hex' | 'base64' | 'base64url';
  preserveByteString: boolean;
}

export function formatCdn(text: string, s: FormatSettings): string | null {
  if (text.trim() === '') return null;

  const preserveComments = s.comments !== 'strip';
  const toOptions: ToCDNOptions = {
    indent: s.indent,
    preserveComments:
      s.comments === 'preserve'
        ? true
        : s.comments === 'strip'
          ? false
          : s.comments,
    preserveByteString: s.preserveByteString,
    commas: s.commas,
    encodingIndicators: s.encodingIndicators,
    appStrings: s.appStrings,
    bstrEncoding: s.bstrEncoding,
  };

  let formatted: string;
  try {
    formatted =
      s.topLevel === 'item'
        ? formatItem(text, preserveComments, toOptions)
        : formatSequence(text, preserveComments, toOptions);
  } catch {
    return null;
  }

  if (!formatted.endsWith('\n')) formatted += '\n';
  if (!verifyRoundTrip(text, formatted, s)) return null;
  return formatted;
}

function formatItem(
  text: string,
  preserveComments: boolean,
  toOptions: ToCDNOptions
): string {
  // strict: any validity violation aborts formatting (throws).
  const item = CBOR.fromCDN(text, {
    strict: true,
    silent: true,
    preserveComments,
  });
  return item.toCDN(toOptions);
}

function formatSequence(
  text: string,
  preserveComments: boolean,
  toOptions: ToCDNOptions
): string {
  const items: CborItem[] = [
    ...CBOR.fromCDNSeq(text, { strict: true, silent: true, preserveComments }),
  ];
  if (items.length === 0) throw new Error('no items');

  const parts = items.map((item) => item.toCDN(toOptions));

  // fromCDNSeq drops comments that follow the last item on later lines
  // (they belong to no item). Re-attach them verbatim so formatting never
  // loses a comment.
  if (preserveComments) {
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
  s: FormatSettings
): boolean {
  // Fixed options so the comparison is independent of the user's style
  // settings; comments are stripped from the comparison on purpose.
  const canonicalOptions: ToCDNOptions = { encodingIndicators: 'always' };
  try {
    const canonicalOf = (text: string): string =>
      s.topLevel === 'item'
        ? CBOR.fromCDN(text, { strict: false, silent: true }).toCDN(
            canonicalOptions
          )
        : [...CBOR.fromCDNSeq(text, { strict: false, silent: true })]
            .map((item) => item.toCDN(canonicalOptions))
            .join(' ');
    if (canonicalOf(original) !== canonicalOf(formatted)) return false;

    if (s.comments === 'preserve' && s.preserveByteString) {
      const commentCount = (text: string): number =>
        tokenizeLenient(text).comments.length;
      if (commentCount(formatted) < commentCount(original)) return false;
    }
    return true;
  } catch {
    return false;
  }
}
