# Changelog

## 0.1.0

Initial release.

- Syntax highlighting for CDN (`.cdn`, `.diag`) via a TextMate grammar.
- Validation with exact error/warning ranges, backed by the `@cbortech/cbor`
  parser (single-item and CBOR-sequence document modes).
- Document formatting with comment and byte-string preservation, guarded by a
  round-trip equality check.
