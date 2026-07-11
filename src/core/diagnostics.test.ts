import { describe, expect, it } from 'vitest';
import { validateCdn } from './diagnostics';

describe('validateCdn (item mode)', () => {
  it('accepts a valid single item', () => {
    expect(validateCdn('{"a": 1, "b": [true, null]}', 'item')).toEqual([]);
  });

  it('accepts CDN-specific syntax', () => {
    const text = `{
      / key / 1: h'deadbeef',
      "when": 1(1700000000),
      "data": << 1, 2 >>,
      "b": b64'aGVsbG8='
    }`;
    expect(validateCdn(text, 'item')).toEqual([]);
  });

  it('returns nothing for an empty document', () => {
    expect(validateCdn('', 'item')).toEqual([]);
    expect(validateCdn('  \n\t', 'item')).toEqual([]);
  });

  it('returns nothing for a comments-only document', () => {
    expect(validateCdn('# just a comment\n/* block */', 'item')).toEqual([]);
  });

  it('reports a syntax error with a position', () => {
    const diags = validateCdn('{"a": }', 'item');
    expect(diags).toHaveLength(1);
    expect(diags[0].severity).toBe('error');
    expect(diags[0].start).toBe(6);
    expect(diags[0].end).toBe(7);
  });

  it('reports an unterminated string as an error', () => {
    const diags = validateCdn('"abc', 'item');
    expect(diags.some((d) => d.severity === 'error')).toBe(true);
  });

  it('warns about trailing content after the single item', () => {
    const diags = validateCdn('1 2', 'item');
    expect(diags).toHaveLength(1);
    expect(diags[0].severity).toBe('warning');
    // The warning underlines the offending trailing token "2".
    expect(diags[0].start).toBe(2);
    expect(diags[0].end).toBe(3);
  });
});

describe('validateCdn (sequence mode)', () => {
  it('accepts multiple items', () => {
    expect(validateCdn('1 "two" [3]', 'sequence')).toEqual([]);
    expect(validateCdn('1, 2, 3', 'sequence')).toEqual([]);
  });

  it('reports a hard syntax error inside an item as an error', () => {
    const diags = validateCdn('1 [2,', 'sequence');
    expect(diags.length).toBeGreaterThan(0);
    expect(diags.some((d) => d.severity === 'error')).toBe(true);
  });

  it('warns about a leading comma', () => {
    const diags = validateCdn(', 1', 'sequence');
    expect(diags).toHaveLength(1);
    expect(diags[0].severity).toBe('warning');
    expect(diags[0].message).toMatch(/leading comma/);
  });
});

// Range-resolution contract for the extended ParseWarning API
// (endOffset / fatal), using the reference inputs from the library.
describe('validateCdn (ParseWarning range contract)', () => {
  it('offset-only fatal warning: error, underline from offset', () => {
    // Warning carries {offset: 3, fatal: true} with no endOffset/line/column.
    const diags = validateCdn('1, /* oops\n2, 3', 'sequence');
    expect(diags).toHaveLength(1);
    expect(diags[0].severity).toBe('error');
    expect(diags[0].start).toBe(3);
    expect(diags[0].end).toBeGreaterThan(3);
    expect(diags[0].message).toMatch(/not parsed/);
  });

  it('full-range fatal warning: [offset, endOffset) used as-is', () => {
    // Warning carries {offset: 7, endOffset: 11, fatal: true} — h'A'.
    const diags = validateCdn("[1, 2, h'A']", 'sequence');
    expect(diags).toHaveLength(1);
    expect(diags[0].severity).toBe('error');
    expect(diags[0].start).toBe(7);
    expect(diags[0].end).toBe(11);
  });

  it('zero-width range at EOF: widened backward over the last character', () => {
    // Warning carries {offset: 16, endOffset: 16, fatal: true} at EOF.
    const diags = validateCdn('1, "unterminated', 'sequence');
    expect(diags).toHaveLength(1);
    expect(diags[0].severity).toBe('error');
    expect(diags[0].start).toBe(15);
    expect(diags[0].end).toBe(16);
  });

  it('non-fatal escape warning: exact two-character range, warning severity', () => {
    // Warning carries {offset: 2, endOffset: 4} for the \0 escape.
    const diags = validateCdn('"a\\0b"', 'item');
    expect(diags).toHaveLength(1);
    expect(diags[0].severity).toBe('warning');
    expect(diags[0].start).toBe(2);
    expect(diags[0].end).toBe(4);
    expect(diags[0].message).not.toMatch(/not parsed/);
  });

  it('zero-width error thrown in item mode is also widened', () => {
    // CdnSyntaxError with offset === endOffset at EOF.
    const text = '"unterminated';
    const diags = validateCdn(text, 'item');
    expect(diags).toHaveLength(1);
    expect(diags[0].severity).toBe('error');
    expect(diags[0].end).toBeGreaterThan(diags[0].start);
    expect(diags[0].end).toBeLessThanOrEqual(text.length);
  });
});
