import { describe, expect, it } from 'vitest';
import { formatCdn, type FormatSettings } from './format';

const defaults: FormatSettings = {
  topLevel: 'item',
  indent: '  ',
  commas: 'comma',
  comments: 'preserve',
  encodingIndicators: 'auto',
  appStrings: true,
  bstrEncoding: 'hex',
  preserveByteString: true,
  preserveRawString: true,
  preserveTextString: true,
  preserveNumberFormat: true,
  preserveAppSequence: true,
  preserveBlankLines: true,
  preserveConcatenation: true,
  splitCdn: true,
  splitNewline: true,
  inlineLeafContainers: true,
};

describe('formatCdn (item mode)', () => {
  it('pretty-prints nested structures', () => {
    // b is a leaf array (no nested containers) so it inlines by default;
    // the outer map contains a container value, so it stays multi-line.
    const out = formatCdn('{"a":1,"b":[1,2]}', defaults);
    expect(out).toBe('{\n  "a": 1,\n  "b": [1, 2]\n}\n');
  });

  it('is idempotent', () => {
    const once = formatCdn('{"a":1,"b":[1,2]}', defaults);
    expect(once).not.toBeNull();
    expect(formatCdn(once!, defaults)).toBe(once);
  });

  it('preserves comments', () => {
    const out = formatCdn('{ "a": 1 } # note', defaults);
    expect(out).toContain('# note');
  });

  it('preserves byte-string spelling', () => {
    const out = formatCdn("h'dead beef'", defaults);
    expect(out).toBe("h'dead beef'\n");
  });

  it('respects the comma setting', () => {
    const out = formatCdn('[1,2,3]', {
      ...defaults,
      commas: 'none',
      inlineLeafContainers: false,
    });
    expect(out).toBe('[\n  1\n  2\n  3\n]\n');
  });

  it('uses tabs when configured', () => {
    const out = formatCdn('[1]', {
      ...defaults,
      indent: '\t',
      inlineLeafContainers: false,
    });
    expect(out).toBe('[\n\t1\n]\n');
  });

  it('returns null for invalid input', () => {
    expect(formatCdn('{"a": }', defaults)).toBeNull();
    expect(formatCdn('"unterminated', defaults)).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(formatCdn('', defaults)).toBeNull();
  });

  it('returns null when an item document contains trailing items', () => {
    expect(formatCdn('1 2', defaults)).toBeNull();
  });

  it('formats documents containing ellipsis', () => {
    const out = formatCdn('[1, ..., 3]', {
      ...defaults,
      inlineLeafContainers: false,
    });
    expect(out).toBe('[\n  1,\n  ...,\n  3\n]\n');
  });

  it('keeps leaf containers inline when inlineLeafContainers is on', () => {
    const out = formatCdn('{"a":1,"b":[1,2]}', {
      ...defaults,
      inlineLeafContainers: true,
    });
    expect(out).toBe('{\n  "a": 1,\n  "b": [1, 2]\n}\n');
  });

  it('produces single-line output for an empty indent', () => {
    expect(formatCdn('[1,\n2,\n3]', { ...defaults, indent: '' })).toBe(
      '[1,2,3]\n'
    );
  });

  it('refuses to format with an empty indent when comments would be lost', () => {
    // Single-line output strips comments; the round-trip check must reject
    // that rather than drop them — independent of preserveByteString, which
    // only excuses comments inside byte-string spellings.
    expect(formatCdn('[1] # note', { ...defaults, indent: '' })).toBeNull();
    expect(
      formatCdn('[1] # note', {
        ...defaults,
        indent: '',
        preserveByteString: false,
      })
    ).toBeNull();
    expect(
      formatCdn('[1] # note', { ...defaults, indent: '', comments: 'c-style' })
    ).toBeNull();
    // With comments explicitly stripped, single-line formatting proceeds.
    expect(
      formatCdn('[1] # note', { ...defaults, indent: '', comments: 'strip' })
    ).toBe('[1]\n');
  });
});

describe('formatCdn (extension literals and string options)', () => {
  it('formats extension literals with all extensions enabled by default', () => {
    expect(
      formatCdn("uuid'f81d4fae-7dec-11d0-a765-00a0c91e6bf6'", defaults)
    ).toBe("uuid'f81d4fae-7dec-11d0-a765-00a0c91e6bf6'\n");
    expect(formatCdn('SET<<[1, 2, 3]>>', defaults)).not.toBeNull();
    expect(formatCdn('MAP<<{1: 2}>>', defaults)).not.toBeNull();
    expect(formatCdn("b32'MZXW6==='", defaults)).not.toBeNull();
  });

  it('keeps + concatenation when preserveConcatenation is on', () => {
    // With indent set, the serializer lays out each part on its own line.
    expect(formatCdn('"a" + "b"', defaults)).toBe('"a" +\n  "b"\n');
  });

  it('joins + concatenation when preserveConcatenation is off', () => {
    expect(
      formatCdn('"a" + "b"', { ...defaults, preserveConcatenation: false })
    ).toBe('"ab"\n');
  });

  it('keeps raw string spelling when preserveRawString is on', () => {
    expect(formatCdn('`a "b" c`', defaults)).toBe('`a "b" c`\n');
  });

  it('converts raw strings to double quotes when preserveRawString is off', () => {
    expect(
      formatCdn('`a "b" c`', { ...defaults, preserveRawString: false })
    ).toBe('"a \\"b\\" c"\n');
  });

  it('keeps double-quoted string spelling when preserveTextString is on', () => {
    expect(formatCdn('"\\u00e9"', defaults)).toBe('"\\u00e9"\n');
  });

  it('re-escapes double-quoted strings when preserveTextString is off', () => {
    expect(
      formatCdn('"\\u00e9"', { ...defaults, preserveTextString: false })
    ).toBe('"é"\n');
  });

  it('keeps number literal spelling when preserveNumberFormat is on', () => {
    expect(formatCdn('0x1A', defaults)).toBe('0x1A\n');
  });

  it('normalizes number literals to decimal when preserveNumberFormat is off', () => {
    expect(
      formatCdn('0x1A', { ...defaults, preserveNumberFormat: false })
    ).toBe('26\n');
  });

  it('keeps app-sequence notation when preserveAppSequence is on', () => {
    expect(formatCdn("DT<<'1969-07-21T02:56:16Z'>>", defaults)).toBe(
      "DT<<'1969-07-21T02:56:16Z'>>\n"
    );
  });

  it('normalizes app-sequence notation when preserveAppSequence is off', () => {
    expect(
      formatCdn("DT<<'1969-07-21T02:56:16Z'>>", {
        ...defaults,
        preserveAppSequence: false,
      })
    ).toBe("DT'1969-07-21T02:56:16Z'\n");
  });

  it('keeps a blank line between entries when preserveBlankLines is on', () => {
    expect(formatCdn('[\n\n1,\n2\n]', defaults)).toBe('[\n\n  1,\n  2\n]\n');
  });

  it('drops the blank line between entries when preserveBlankLines is off', () => {
    // With no blank line to preserve, this leaf container collapses to one
    // line under the default inlineLeafContainers setting.
    expect(
      formatCdn('[\n\n1,\n2\n]', { ...defaults, preserveBlankLines: false })
    ).toBe('[1, 2]\n');
  });

  it('splits strings at newlines when splitNewline is on', () => {
    const out = formatCdn('"line1\\nline2"', {
      ...defaults,
      preserveConcatenation: false,
      preserveTextString: false,
      splitNewline: true,
    });
    expect(out).toBe('"line1\\n" +\n  "line2"\n');
  });
});

describe('formatCdn (sequence mode)', () => {
  const seq: FormatSettings = { ...defaults, topLevel: 'sequence' };

  it('formats each item on its own line', () => {
    expect(
      formatCdn('1,  2,[3, 4]', { ...seq, inlineLeafContainers: false })
    ).toBe('1\n2\n[\n  3,\n  4\n]\n');
  });

  it('keeps orphan comments after the last item', () => {
    const out = formatCdn('1, 2 # same line\n# orphan', seq);
    expect(out).toContain('# same line');
    expect(out).toContain('# orphan');
  });

  it('returns null on a syntax error', () => {
    expect(formatCdn('1 [2,', seq)).toBeNull();
  });
});
