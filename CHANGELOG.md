# Changelog

## Unreleased

- Support all bundled @cbortech/cbor application extensions (`dt`, `ip`,
  `cri`, `t1`, `b1`, `ilbs`, `ilts`, `float`, `same`, `b32`, `h32`) plus
  `hash` (@cbortech/hash-extension), `uuid` (@cbortech/uuid-extension), and
  `set` / `map` (@cbortech/set-map-extensions), each individually
  configurable via `cdn.extensions.*` (all enabled by default).
- New formatter settings `cdn.format.preserveConcatenation` (default on),
  `cdn.format.splitCdn`, and `cdn.format.splitNewline`, replacing the
  deprecated `textStringFormat` library option.

## 0.1.0

Initial release.

- Syntax highlighting for CDN (`.cdn`, `.diag`) via a TextMate grammar.
- Validation with exact error/warning ranges, backed by the `@cbortech/cbor`
  parser (single-item and CBOR-sequence document modes).
- Document formatting with comment and byte-string preservation, guarded by a
  round-trip equality check.
