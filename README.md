# ASON for Visual Studio Code

Syntax highlighting, source-preserving formatting, and live validation for [ASON](https://github.com/hemashushu/ason), a typed data format related to JSON.

The extension runs as a web extension in desktop VS Code and VS Code for the Web, including vscode.dev and github.dev. It supports documents in remote and virtual workspaces. Rust, a native formatter executable, and network access are not required at runtime. Documents are processed locally; their contents are never sent to a service.

## Install and Use

Search for "ASON" in VS Code's Extensions view and install `Hemashushu.ason-vscode` from the Visual Studio Code Marketplace.

Or download the VSIX package from the [ason-vscode repository](https://github.com/hemashushu/ason-vscode) and install it using _Extensions: Install from VSIX..._ in VS Code.

Once the extension is installed, open a file ending in `.ason`. For an untitled document, select the _ASON_ language mode. Choose _Format Document_ to format the entire document.

To enable format on save with four-space indentation, add these settings:

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

| Setting                      | Default          | Meaning                                          |
| ---------------------------- | ---------------- | ------------------------------------------------ |
| `ason.validation.enabled`    | `true`           | Turn automatic validation on or off.              |
| `ason.validation.delay`      | `300`            | Delay before validation, in milliseconds.         |
| `ason.validation.maxFileSize` | `2097152` (2 MiB) | Maximum UTF-8 byte size for automatic validation. |

Explicit formatting is not limited by the automatic validation size limit. The worker has a 10-second watchdog for initialization and another for active work. If it gets stuck, the extension terminates it and can create a new worker for the next request. Automatic validation failures and documents skipped for being too large are recorded in the ASON output channel without logging their contents. Syntax highlighting remains available.

## Build from Source

### Requirements

- Node.js 24 or later and npm. You can manage Node.js with [fnm](https://github.com/Schniz/fnm).
- Rust with the `wasm32-unknown-unknown` target. The project was tested with Rust 1.99.1.
- `wasm-bindgen-cli` **0.2.130**. The build script requires this exact version.
- Network access to download build dependencies, Chromium, and the test versions of VS Code.

#### Windows Setup

In Visual Studio Installer (verified with Visual Studio Community 2026), select the **Desktop development with C++** workload and explicitly enable **C++ Clang tools for Windows**; this optional component may not be selected by default. Run the Cargo installation below from **Developer PowerShell for VS**. Without Clang, installation can fail while compiling the `ring` dependency with `failed to find tool "clang": program not found`, even if ordinary Rust programs compile successfully.

For SSH or other terminal-only sessions, initialize the same development environment in your existing PowerShell terminal:

```powershell
Import-Module 'C:\Program Files\Microsoft Visual Studio\18\Community\Common7\Tools\Microsoft.VisualStudio.DevShell.dll'
Enter-VsDevShell 82f965c8 -SkipAutomaticLocation
```

Replace these example values with those from your installation:

- **DLL path:** The drive, installation directory, version directory `18`, and edition `Community` may differ.
- **Instance ID:** Replace `82f965c8` with your Visual Studio instance ID.

Find both values in the **Target** field of your **Developer PowerShell for VS** shortcut: the path follows `Import-Module`, and the instance ID follows `Enter-VsDevShell`. They may change after reinstalling Visual Studio. `-SkipAutomaticLocation` preserves your working directory. The environment applies only to the current terminal session; rerun these commands after reconnecting over SSH.

### Install the Toolchain

```sh
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.130 --locked
```

If the build reports that `wasm-bindgen` cannot be found, ensure Cargo's binary directory (`$HOME/.cargo/bin` by default) is on your terminal's `PATH`.

### Get the Source

Clone `ason-vscode` and `ason-formatter` into sibling directories. The formatter checkout must include the `ason-format-wasm` crate and its Cargo lockfile. A separate checkout of the `ason` repository is not required: Cargo downloads the ASON library as a registry dependency of the formatter.

```sh
git clone https://github.com/hemashushu/ason-vscode.git
git clone https://github.com/hemashushu/ason-formatter.git
cd ason-vscode
```

### Build

Run the following commands from `ason-vscode`:

```sh
npm ci
npm run build:wasm -- --formatter-dir ../ason-formatter
npm run build
```

Set `ASON_FORMATTER_DIR` instead of passing `--formatter-dir` if you prefer. Generated assets are ignored by version control, so build the WASM engine before compiling or packaging. The build uses the formatter's Cargo lockfile, checks the binding tool's version, and records compiler versions and artifact hashes in the package.

### Test

Install the Chromium browser required by the project's Playwright version before running the web tests for the first time:

```sh
npx --no-install playwright install chromium
```

Rerun this command if a dependency update requires a different browser version. On Linux, use `npx --no-install playwright install --with-deps chromium` to install browser system dependencies as well; this may require administrator privileges. Without the matching browser, `test:web` can fail to launch Chromium and leave its local server running, making the command appear stuck.

Run the unit and extension-host tests:

```sh
npm test
npm run test:web
npm run test:desktop
```

`npm test` builds the extension and runs the TextMate grammar, WASM, and worker scheduling tests. The Web and desktop host tests rebuild the JavaScript and exercise formatting, diagnostics, and save workflows. Each successful host run ends with `8 ASON host tests passed.` and exit code 0.

By default, `test:desktop` downloads VS Code 1.145.0. To use an existing desktop installation, set `VSCODE_EXECUTABLE` to the path of its executable. On a headless Linux machine, run the desktop tests with `xvfb-run -a npm run test:desktop` (requires Xvfb). `test:web` uses a pinned stable VS Code Web build and headless Chromium with cross-origin isolation enabled.

The desktop test launcher disables Electron background timer throttling so worker-based validation can finish even when the test window is not focused. Both hosts can print VS Code startup warnings about API proposals, account services, or file watching; the web host can also report an initial file-system-provider warning and a missing optional `package.nls.json`. The invalid-formatting test intentionally logs `Cannot format ASON: Duplicate key "a" in Object.`. These messages alone do not indicate a failed test. A diagnostic timeout, failed assertion, or nonzero exit code is a real test failure.

### Package

```sh
npm run package
```

This rebuilds the JavaScript and creates `ason-vscode.vsix` in the current directory. The VSIX bundles the WASM engine and is platform-independent; no source checkout, Rust installation, or native formatter is needed at runtime. Install it with _Extensions: Install from VSIX..._.

### Develop

Build the WASM engine once, then press F5 to launch the "Run ASON Web Extension" configuration. `npm run watch` rebuilds the JavaScript as you edit. Rebuild the WASM engine after changing the Rust code.

### Continuous Integration

The manually triggered **Test and Package** workflow requires the full 40-character SHA of a formatter commit that includes the WASM bridge. It runs on Linux, macOS, and Windows, with a 15-minute timeout for each Web or desktop host-test step, and uploads a VSIX artifact for each OS. If the required formatter changes are not yet available remotely, build with a local checkout instead. The workflow does not publish releases or commit changes.

## Links

- [ASON Specification](https://github.com/hemashushu/ason/blob/main/docs/specification.md)
- [ASON Visual Studio Code Extension](https://github.com/hemashushu/ason-vscode)
- [ASON-Formatter library](https://github.com/hemashushu/ason-formatter)
- [ASON Rust Library](https://github.com/hemashushu/ason)

## License

Licensed under MPL-2.0, with additional terms in [LICENSE.additional](LICENSE.additional). See [LICENSE](LICENSE) and [CONTRIBUTING](CONTRIBUTING) for details. The bundled formatter comes from [ASON Formatter](https://github.com/hemashushu/ason-formatter) by Hemashushu; its source and license notices are kept in the companion project. Dependency license notices are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).