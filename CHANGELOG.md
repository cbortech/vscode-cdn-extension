# Changelog

## 0.27.2

- Update `@cbortech/cbor` to 0.27.2.
- `e'…'` external-reference literals (draft-ietf-cbor-edn-e-ref) are now
  reported with an informational hint: they need a CDDL schema to resolve
  names against, which this extension does not support, so they are parsed
  as unresolved (tag 999).
- Formatter: an unresolved single-word app-string literal (e.g. `e'alg'`) no
  longer forces its enclosing array/map onto multiple lines under
  `cdn.format.inlineLeafContainers`.
- Formatter: subnormal floats rendered in hex (`cdn.format.floatFormat: hex`)
  now use normalized notation (e.g. `0x1p-1023` instead of `0x0.8p-1022`).

## 0.27.0

- Update `@cbortech/cbor` (and the `hash-extension`/`uuid-extension`/
  `set-map-extensions` companions) to 0.27.0.
- **Breaking**: renamed formatter settings to match the library's
  draft-ietf-cbor-edn-literals-27 `app-prefix` terminology — update your
  settings if you use these:
  - `cdn.format.appStrings` → `cdn.format.appPrefix`
  - `cdn.format.preserveAppSequence` → `cdn.format.preserveAppPrefix`
- New formatter setting `cdn.format.floatFormat` (`decimal` / `hex` /
  `app-extension`, unset by default): the new `app-extension` value emits
  `float'…'` notation carrying the value's exact IEEE 754 bit pattern,
  including NaN payloads and ±Infinity. Left unset, a `float'…'` literal
  keeps its original bit-pattern spelling; explicit `decimal`/`hex`
  renormalizes it and can lose a non-canonical bit pattern such as a NaN
  payload, so the formatter's round-trip guard now refuses to apply that
  rewrite rather than silently changing the data.
- New formatter settings `cdn.format.modernConcat` and
  `cdn.format.modernStreamSyntax` (both default off): render preserved `+`
  concatenation/elision chains and indefinite-length strings using
  `t1<<…>>`/`b1<<…>>`/`ilts<<…>>`/`ilbs<<…>>` app-sequence notation instead
  of the legacy `+` and `(_ ...)` forms.
- `dt`/`ip`/`t1`/`b1` mandatory-to-implement references updated to
  draft-ietf-cbor-edn-literals-27 §3.

## 0.26.5

- Update `@cbortech/cbor` to 0.26.5.
- New formatter setting `cdn.format.preserveRawString` (default on): keep the
  original spelling of raw backtick string literals.
- New formatter setting `cdn.format.inlineLeafContainers` (default on): keep
  arrays/maps that contain no nested containers on a single line
  (e.g. `[1, 2, 3]`).
- Missing-extension hints (a known but disabled/unregistered extension prefix)
  are now reported at Information severity instead of Warning; validity
  violations remain warnings or errors.
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
