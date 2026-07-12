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
  preserveConcatenation: true,
  splitCdn: true,
  splitNewline: true,
};

describe('formatCdn (item mode)', () => {
  it('pretty-prints nested structures', () => {
    const out = formatCdn('{"a":1,"b":[1,2]}', defaults);
    expect(out).toBe('{\n  "a": 1,\n  "b": [\n    1,\n    2\n  ]\n}\n');
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
    const out = formatCdn('[1,2,3]', { ...defaults, commas: 'none' });
    expect(out).toBe('[\n  1\n  2\n  3\n]\n');
  });

  it('uses tabs when configured', () => {
    const out = formatCdn('[1]', { ...defaults, indent: '\t' });
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
    const out = formatCdn('[1, ..., 3]', defaults);
    expect(out).toBe('[\n  1,\n  ...,\n  3\n]\n');
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

  it('splits strings at newlines when splitNewline is on', () => {
    const out = formatCdn('"line1\\nline2"', {
      ...defaults,
      preserveConcatenation: false,
      splitNewline: true,
    });
    expect(out).toBe('"line1\\n" +\n  "line2"\n');
  });
});

describe('formatCdn (sequence mode)', () => {
  const seq: FormatSettings = { ...defaults, topLevel: 'sequence' };

  it('formats each item on its own line', () => {
    expect(formatCdn('1,  2,[3, 4]', seq)).toBe('1\n2\n[\n  3,\n  4\n]\n');
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
