# Changelog

## Unreleased

- Recognize `.edn` as a CDN file extension, alongside `.cdn` and `.diag`.
- Support all bundled @cbortech/cbor application extensions (`dt`, `ip`,
  `cri`, `t1`, `b1`, `ilbs`, `ilts`, `float`, `same`, `b32`, `h32`) plus
  `hash` (@cbortech/hash-extension), `uuid` (@cbortech/uuid-extension), and
  `set` / `map` (@cbortech/set-map-extensions), each individually
  configurable via `cdn.extensions.*` (all enabled by default).
- New formatter settings `cdn.format.preserveConcatenation`,
  `cdn.format.splitCdn`, and `cdn.format.splitNewline` (all default on),
  replacing the deprecated `textStringFormat` library option.
- Fixed: disabling the `set` or `map` extension (`cdn.extensions.set` /
  `cdn.extensions.map`) now reports a diagnostic hint, matching the behavior
  of every other extension prefix.

## 0.1.0

Initial release.

- Syntax highlighting for CDN (`.cdn`, `.diag`) via a TextMate grammar.
- Validation with exact error/warning ranges, backed by the `@cbortech/cbor`
  parser (single-item and CBOR-sequence document modes).
- Document formatting with comment and byte-string preservation, guarded by a
  round-trip equality check.
