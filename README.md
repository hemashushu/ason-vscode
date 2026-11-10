# ASON for Visual Studio Code

Syntax highlighting, source-preserving formatting, and live validation for [ASON](https://github.com/hemashushu/ason), a typed data format related to JSON.

The extension runs as a web extension in desktop VS Code and VS Code for the Web, including vscode.dev and github.dev. It supports documents in remote and virtual workspaces. Rust, a native formatter executable, and network access are not required at runtime. Documents are processed locally; their contents are never sent to a service.

## Install and Use

You can install the extension from the Visual Studio Code Marketplace, search for "ASON" (identifier: `Hemashushu.ason-vscode`), and install it directly.

Or download the VSIX package from the [ason-vscode repository](https://github.com/hemashushu/ason-vscode) and install it using _Extensions: Install from VSIX..._ in VS Code.

Once the extension is installed, open a file ending in `.ason`. For an untitled document, select the _ASON_ language mode. Choose _Format Document_ to format the entire document.

To use these editor settings, add them to your VS Code settings:

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

Syntax highlighting follows the active theme. It covers nested comments, typed numbers and hex floats, Unicode identifiers, enumerations, characters, ordinary, raw, and auto-trimmed strings, date-times, and hexadecimal byte data. Highlighting remains available while a string, comment, or container is incomplete, even if the formatter engine fails to load.

## Formatting and Diagnostics

Formatting uses the Rust `ason-format` library:

- Editor indentation and the document's LF or CRLF setting determine the generated layout.
- Containers without comments or multiline tokens stay on one line if the formatted result fits within 80 characters. Otherwise, nonempty containers use multiple lines.
- Optional commas and extra blank lines are removed, and one space is added after each colon.
- A final structural newline is added.
- The Rust engine preserves literal spellings and comment bodies, including their internal indentation and line endings. It does not replace line endings throughout the document. However, VS Code normalizes line endings in its text model when applying edits, so files with mixed line endings are not guaranteed to remain byte-for-byte identical.
- Invalid documents are never partially formatted. Empty or comment-only documents are invalid because ASON requires exactly one root value.

After a short delay, live diagnostics report the first syntax or validation error. Parser error ranges account for Unicode characters, and unexpected EOF points to the end of the document. The shared library does not provide source ranges for some collection-type errors. These appear on the first line as "Document validation" errors rather than being attached to a guessed token. The validator is not schema-aware and does not recover to report multiple errors.

| Setting                       | Default   | Meaning                                    |
| ----------------------------- | --------- | ------------------------------------------ |
| `ason.validation.enabled`     | `true`    | Turn automatic validation on or off.        |
| `ason.validation.delay`       | `300`     | Delay before validation, in milliseconds.   |
| `ason.validation.maxFileSize` | `2097152` (2 MiB) | Maximum UTF-8 byte size for automatic validation. |

Explicit formatting is not limited by the automatic validation size limit. The worker has a 10-second watchdog for initialization and another for active work. If it gets stuck, the extension terminates it and can create a new worker for the next request. Automatic validation failures and documents skipped for being too large are recorded in the ASON output channel without logging their contents. Syntax highlighting remains available.

## Build from Source

To build the VSIX package from source, you need Node.js 24 or later, npm, Rust with the `wasm32-unknown-unknown` target, and `wasm-bindgen-cli` 0.2.130. The project was tested with Rust 1.99.1.

```sh
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.130 --locked
```

Clone the `ason-vscode`, `ason`, and `ason-formatter` repositories, then change to the `ason-vscode` directory:

```sh
git clone https://github.com/hemashushu/ason-vscode.git
git clone https://github.com/hemashushu/ason.git
git clone https://github.com/hemashushu/ason-formatter.git
cd ason-vscode
```

Install the dependencies:

```sh
npm ci
```

Build and test the project:

```sh
npm run build:wasm -- --formatter-dir ../ason-formatter
npm test
npm run test:web
npm run test:desktop
```

Package the extension:

```sh
npm run package
```

This creates `ason-vscode.vsix` in the current directory.

Set `ASON_FORMATTER_DIR` instead of passing `--formatter-dir` if you prefer. Generated assets are ignored by version control, so build them before compiling or packaging. The build uses the formatter's Cargo lockfile, checks the binding tool's version, and records compiler and artifact hashes in the package. The VSIX contains the WASM engine, so neither repository checkout is needed at runtime.

Press F5 to launch the "Run ASON Web Extension" configuration. Build the WASM engine once before starting the development host. `npm run watch` rebuilds the JavaScript as you edit. Rebuild the WASM engine after changing the Rust code.

By default, `test:desktop` downloads VS Code 1.145.0. To use an existing desktop installation, set `VSCODE_EXECUTABLE` to the path of its executable. `test:web` uses a pinned stable VS Code Web build and Chromium with cross-origin isolation enabled. Together, the tests cover the TextMate grammar, WASM, worker scheduling, and formatting, diagnostics, and save workflows in both extension hosts.

The desktop test launcher disables Electron background timer throttling so worker-based validation can finish even when the test window is not focused. Both hosts can print VS Code startup warnings about API proposals, account services, or file watching; the web host can also report an initial file-system-provider warning and a missing optional `package.nls.json`. The invalid-formatting test intentionally logs `Cannot format ASON: Duplicate key "a" in Object.`. These messages alone do not indicate a failed test: a successful run ends with `8 ASON host tests passed.` and exit code 0. A diagnostic timeout or nonzero exit code is a real test failure.

The manually triggered CI workflow accepts an immutable formatter commit SHA that includes the bridge. It runs on Linux, macOS, and Windows. Until the companion changes are committed and available, build locally using the explicitly supplied formatter checkout. This project does not publish releases or commit changes automatically.

## Links

- [ASON Specification](https://github.com/hemashushu/ason/blob/main/docs/specification.md)
- [ASON Visual Studio Code Extension](https://github.com/hemashushu/ason-vscode)
- [ASON-Formatter library](https://github.com/hemashushu/ason-formatter)
- [ASON Rust Library](https://github.com/hemashushu/ason)

## License

Licensed under MPL-2.0, with additional terms in [LICENSE.additional](LICENSE.additional). See [LICENSE](LICENSE) and [CONTRIBUTING](CONTRIBUTING) for details. The bundled formatter comes from [ASON Formatter](https://github.com/hemashushu/ason-formatter) by Hemashushu; its source and license notices are kept in the companion project. Dependency license notices are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).