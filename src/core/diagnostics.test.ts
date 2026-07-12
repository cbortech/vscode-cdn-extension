import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { validateCdn } from './diagnostics';

describe('bundled samples', () => {
  const read = (name: string): string =>
    readFileSync(
      fileURLToPath(new URL(`../../samples/${name}`, import.meta.url)),
      'utf8'
    );

  it('example.cdn validates cleanly in item mode', () => {
    expect(validateCdn(read('example.cdn'), 'item')).toEqual([]);
  });

  it('sequence.diag validates cleanly in sequence mode', () => {
    expect(validateCdn(read('sequence.diag'), 'sequence')).toEqual([]);
  });
});

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

describe('validateCdn (extensions)', () => {
  it('accepts all supported extension literals by default', () => {
    const text = `{
      1: dt'2023-01-01T12:00:00Z',
      2: ip'192.168.0.1',
      3: uuid'f81d4fae-7dec-11d0-a765-00a0c91e6bf6',
      4: SET<<[1, 2]>>,
      5: MAP<<{1: 2}>>,
      6: b32'MZXW6===',
      7: float'3e00'
    }`;
    expect(validateCdn(text, 'item')).toEqual([]);
  });

  it('reports invalid extension literal content', () => {
    const diags = validateCdn("uuid'not-a-uuid'", 'item');
    expect(diags.length).toBeGreaterThan(0);
    expect(diags[0].message).toMatch(/invalid UUID/);
  });

  it('hints when a known extension prefix is disabled', () => {
    const diags = validateCdn(
      "uuid'f81d4fae-7dec-11d0-a765-00a0c91e6bf6'",
      'item',
      { uuid: false }
    );
    expect(diags).toHaveLength(1);
    expect(diags[0].severity).toBe('warning');
    expect(diags[0].message).toMatch(/requires an extension/);
  });

  it('hints when a bundled extension is disabled', () => {
    const diags = validateCdn("dt'2023-01-01T12:00:00Z'", 'item', {
      dt: false,
    });
    expect(diags).toHaveLength(1);
    expect(diags[0].severity).toBe('warning');
    expect(diags[0].message).toMatch(/builtinExtensions/);
  });

  it('disabling one extension leaves the others active', () => {
    expect(
      validateCdn("ip'10.0.0.1'", 'item', { uuid: false, set: false })
    ).toEqual([]);
  });

  // Regression: SET/MAP (@cbortech/set-map-extensions) use the app-sequence
  // form (prefix<<...>>) and are not covered by @cbortech/cbor's own
  // missing-extension hint table, so disabling them used to parse silently
  // to an unresolved tag-999 node with no diagnostic at all.
  it('hints when the set extension is disabled', () => {
    const diags = validateCdn('SET<<[1, 2, 3]>>', 'item', { set: false });
    expect(diags).toHaveLength(1);
    expect(diags[0].severity).toBe('warning');
    expect(diags[0].message).toMatch(/'set' extension/);
    expect(diags[0].message).toMatch(/cdn\.extensions\.set/);
    expect(diags[0].start).toBe(0);
    expect(diags[0].end).toBe('SET<<[1, 2, 3]>>'.length);
  });

  it('hints when the map extension is disabled', () => {
    const diags = validateCdn('MAP<<{1: 2}>>', 'item', { map: false });
    expect(diags).toHaveLength(1);
    expect(diags[0].severity).toBe('warning');
    expect(diags[0].message).toMatch(/'map' extension/);
  });

  it('hints for a disabled set/map literal nested inside a container', () => {
    const diags = validateCdn('[1, SET<<[2]>>, {"k": MAP<<{1: 2}>>}]', 'item', {
      set: false,
      map: false,
    });
    expect(diags).toHaveLength(2);
    expect(diags.every((d) => d.severity === 'warning')).toBe(true);
  });

  it('does not duplicate a diagnostic already reported by the library hint', () => {
    // dt is covered by @cbortech/cbor's own missing-extension hint table;
    // the app-side fallback walk must not add a second diagnostic for it.
    const diags = validateCdn("dt'2023-01-01T12:00:00Z'", 'item', {
      dt: false,
    });
    expect(diags).toHaveLength(1);
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
