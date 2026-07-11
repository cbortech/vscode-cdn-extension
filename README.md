# CDN (CBOR-EDN) for Visual Studio Code

Language support for **CDN** (Concise Diagnostic Notation,
[draft-ietf-cbor-edn-literals](https://datatracker.ietf.org/doc/draft-ietf-cbor-edn-literals/)),
the human-readable text format for CBOR data and a superset of JSON.

Powered by [@cbortech/cbor](https://www.npmjs.com/package/@cbortech/cbor), so
highlighting, validation, and formatting agree exactly with a real CDN parser.

## Features

- **Syntax highlighting** for `.cdn` and `.diag` files: numbers in all bases,
  hex floats, text/byte strings (`h'…'`, `b64'…'`, `'…'`, `` `…` ``),
  application-oriented literals (`dt'…'`, `ip'…'`, …), tags, embedded CBOR
  (`<< … >>`), encoding indicators (`_`, `_3`), ellipsis (`...`), and all four
  comment styles (`#`, `//`, `/* … */`, `/ … /`).
- **Validation** as you type: syntax errors and CDN validity violations are
  underlined at their exact source range.
- **Formatting** (`Format Document`): pretty-prints with your editor's
  indentation settings while preserving comments and the original spelling of
  byte strings. The formatter verifies that the formatted text still parses to
  the same data before touching your document, and does nothing otherwise.

## Settings

| Setting                         | Default      | Description                                                                                                                                  |
| ------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `cdn.validate.enable`           | `true`       | Enable validation.                                                                                                                           |
| `cdn.validate.topLevel`         | `"item"`     | `"item"`: one CDN data item per document (application/cdn). `"sequence"`: allow multiple items (CBOR sequence). Also controls the formatter. |
| `cdn.format.commas`             | `"comma"`    | Comma style: `comma`, `none`, or `trailing`.                                                                                                 |
| `cdn.format.comments`           | `"preserve"` | Keep comments as-is, normalize to `c-style` / `cdn-style`, or `strip`.                                                                       |
| `cdn.format.encodingIndicators` | `"auto"`     | Emit `_N` indicators `always`, `auto` (only when non-canonical), or `never`.                                                                 |
| `cdn.format.appStrings`         | `true`       | Prefer `dt'…'`-style literals over raw tag notation.                                                                                         |
| `cdn.format.bstrEncoding`       | `"hex"`      | Fallback byte-string encoding: `hex`, `base64`, `base64url`.                                                                                 |
| `cdn.format.preserveByteString` | `true`       | Keep the original spelling of byte-string literals.                                                                                          |

## Development

```bash
npm install
npm run build       # bundle dist/extension.cjs
npm test            # unit tests for the validation/formatting core
npm run typecheck
```

Press **F5** in VS Code to launch an Extension Development Host with the
[samples/](samples/) folder open.

`@cbortech/cbor` is resolved from `../cbor` (a `file:` dependency) during
development; switch it to a published version before releasing.

```bash
npm run package     # build a .vsix with vsce
```

## License

Apache-2.0
