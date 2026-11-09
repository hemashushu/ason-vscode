# ASON for Visual Studio Code

Syntax highlighting, source-preserving formatting and live validation for
[ASON](https://github.com/hemashushu/ason), a typed data format related to JSON.

The extension runs as a Web extension on desktop VS Code and VS Code for the Web
(including vscode.dev and github.dev). Remote and virtual workspace documents
are supported. Rust, a native formatter executable and network access are not
required at runtime. Document contents are processed locally and are not sent
to a service.

## Install and Use

Install the built VSIX using **Extensions: Install from VSIX...**, then open a
file ending in `.ason`. For untitled documents, select the **ASON** language mode.
Use **Format Document** to format the complete document.

To enable formatting on save, add this to your VS Code settings:

```json
{
  "[ason]": {
    "editor.defaultFormatter": "hemashushu.ason-vscode",
    "editor.formatOnSave": true,
    "editor.insertSpaces": true,
    "editor.tabSize": 4
  }
}
```

Syntax colors follow the active theme. Highlighting covers nested comments,
typed numbers and hex floats, Unicode identifiers, enumerations, characters,
ordinary/raw/auto-trimmed strings, date-times and hexadecimal byte data. It
continues working while a string, comment or container is incomplete, and does
not depend on the formatter engine loading successfully.

## Formatting and Diagnostics

Formatting reuses the Rust `ason-format` library, not a TypeScript rewrite:

- Editor indentation and the document's LF/CRLF setting control generated layout.
- Compact containers stay on one line when they fit within 80 characters.
- Optional commas and extra blank lines are removed; colons receive one space.
- A final structural newline is emitted.
- Literal spellings and comment bodies are copied unchanged by the Rust engine,
  including internal indentation and line endings. There is no global newline
  replacement. VS Code itself normalizes text-model line endings when applying
  edits; mixed line endings are therefore not a byte-preservation guarantee for
  files edited in VS Code.
- Invalid documents are never partially formatted. Empty or comment-only
  documents are invalid because ASON requires exactly one root value.

Live diagnostics report the first syntax or validation error after a short
pause. Parser errors have Unicode-correct source ranges; unexpected EOF points
to the document end. Some collection-type errors have no source range in the
shared library: these appear on the first line as **Document validation** errors,
not as a guessed offending token. This is not a schema-aware validator or a
multi-error recovery parser.

| Setting | Default | Meaning |
| --- | --- | --- |
| `ason.validation.enabled` | `true` | Enable automatic validation. |
| `ason.validation.delay` | `300` | Debounce delay in milliseconds. |
| `ason.validation.maxFileSize` | `2097152` | UTF-8 byte limit for automatic validation. |

Explicit formatting is not subject to the automatic validation size limit.
Initialization and active computation each have a 10-second watchdog; a stuck
worker is terminated and the next request can recreate it. Automatic validation
failures and skipped large documents are recorded in the **ASON** output channel
without logging document contents. Highlighting remains available.

## Build from Source

Development requires Node.js 24+, npm, Rust with the `wasm32-unknown-unknown`
target, and `wasm-bindgen-cli` **0.2.130**. The tested Rust version is 1.99.1.

The formatter checkout must contain the new `crates/ason-format-wasm` bridge and
editor layout/validation APIs. These changes are in the companion
[ason-formatter](https://github.com/hemashushu/ason-formatter) project; the
published `ason-format` 1.0.0 alone does not provide them. The base `ason` crate
is reused from crates.io and does not need modification.

```sh
npm ci
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.130 --locked
npm run build:wasm -- --formatter-dir ../ason-formatter
npm test
npm run test:web
npm run test:desktop
npm run package
```

`ASON_FORMATTER_DIR` is an alternative to `--formatter-dir`. Generated assets
are ignored by version control; build them before compiling or packaging. The
build uses the formatter's Cargo lockfile, checks the binding-tool version, and
records compiler and artifact hashes in the package. The resulting
`ason-vscode.vsix` contains the WASM engine and needs neither checkout at runtime.

Press F5 to launch the **Run ASON Web Extension** configuration. Build WASM once
before starting the development host. `npm run watch` rebuilds JavaScript while
editing; rerun the WASM build after changing Rust.

`test:desktop` downloads VS Code 1.100.0 by default. To use an existing desktop
installation, set `VSCODE_EXECUTABLE` to its actual executable. `test:web` uses a
pinned stable VS Code Web build and Chromium with cross-origin isolation enabled.
Tests cover the real TextMate grammar, WASM, worker scheduling and the same
formatting/diagnostic/save workflows in both extension hosts.

The manually dispatched CI workflow accepts an immutable formatter commit SHA
containing the bridge; it runs on Linux, macOS and Windows. Until the companion
changes have been committed and made available, local builds use the explicitly
supplied checkout instead. This project does not publish or commit automatically.

## Reuse and Scope

`ason` supplies parsing, source positions and lossless tokens. `ason-format`
supplies formatting and collection-type validation through a small WASM bridge.
The CLI's ANSI/HTML rendering is not used: a TextMate grammar provides incremental
theme-aware editor highlighting, including lexically incomplete input that the
strict Rust highlighter rejects. Heavy work runs in a separate worker; stale
results never overwrite a newer document version.

Range formatting, on-type formatting, completion and schema features are not
included. The extension supports untrusted workspaces and does not execute
workspace programs.

## License

MPL-2.0 with the additional terms in [LICENSE.additional](LICENSE.additional).
See [LICENSE](LICENSE) and [CONTRIBUTING](CONTRIBUTING). The bundled formatter is
from ASON Formatter by Hemashushu; its source and license notices are retained
in the companion project. Dependency license notices are included in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).