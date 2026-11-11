# ASON for Visual Studio Code

ASON is a typed data format based on JSON. This extension adds syntax highlighting, formatting, and live validation for ASON files.

It works in desktop VS Code and VS Code for the Web, including vscode.dev and github.dev, and supports remote and virtual workspaces. Files are processed locally and are never sent to a service.

<!-- @import "[TOC]" {cmd="toc" depthFrom=2 depthTo=4 orderedList=false} -->

<!-- code_chunk_output -->

- [Install and Use](#install-and-use)
- [Formatting and Diagnostics](#formatting-and-diagnostics)
- [Build from Source](#build-from-source)
  - [Requirements](#requirements)
  - [Get the Source](#get-the-source)
  - [Build](#build)
  - [Test](#test)
  - [Package](#package)
  - [Develop](#develop)
  - [Continuous Integration](#continuous-integration)
- [Links](#links)
- [License](#license)

<!-- /code_chunk_output -->


## Install and Use

Install **ASON** (`Hemashushu.ason-vscode`) from the Extensions view. You can also install a downloaded VSIX by choosing _Extensions: Install from VSIX..._.

Open a `.ason` file to get started. For an untitled file, select _ASON_ as the language mode. Choose _Format Document_ to format the document.

To set ASON-specific editor options, add them under the `[ason]` section in your VS Code settings:

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

Extension settings are available under the **ASON** category in VS Code.

Syntax highlighting follows your active theme and covers nested comments, typed numbers, hex floats, Unicode identifiers, enums, strings, dates, and byte data. It remains available while you type, even when a document is incomplete.

## Formatting and Diagnostics

Formatting follows the editor's indentation and the document's LF or CRLF setting. Containers stay on one line when they fit within 80 characters, unless comments or multiline tokens require line breaks; longer containers use multiple lines. Formatting removes optional commas and extra blank lines, adds a space after each colon, and ends the document with a newline.

Literal spellings and comment text are preserved. VS Code normalizes line endings when it applies edits, so files that mix LF and CRLF may change. Invalid documents are not partially formatted. An ASON document must contain exactly one root value, so empty and comment-only documents cannot be formatted.

Live validation reports the first syntax or validation error after a short delay. It checks ASON itself, not a user-defined schema. Some collection errors are reported at the document level instead of being attached to a specific token.

| Setting                       | Default          | Description                                      |
| ----------------------------- | ---------------- | ------------------------------------------------ |
| `ason.validation.enabled`     | `true`           | Turn live validation on or off.                  |
| `ason.validation.delay`       | `300`            | Delay before validation, in milliseconds.        |
| `ason.validation.maxFileSize` | `2097152` (2 MiB) | Maximum UTF-8 file size for live validation, in bytes. |

The size limit applies only to live validation; you can still format larger files. Validation errors and skipped files appear in the ASON output channel. Document contents are never logged.

## Build from Source

### Requirements

- Node.js 24 or later and npm.
- An internet connection to install dependencies and test tools.

### Get the Source

Clone this repository and navigate into it:

```sh
git clone https://github.com/hemashushu/ason-vscode.git
cd ason-vscode
```

### Build

Run the following commands from `ason-vscode` workspace:

```sh
npm ci
npm run build
```

### Test

The web tests require Chromium. Install it before the first run:

```sh
npx --no-install playwright install chromium
```

On Linux, install Chromium's system dependencies as well:

```sh
npx --no-install playwright install --with-deps chromium
```

Run the unit and extension-host tests:

```sh
npm test
npm run test:web
npm run test:desktop
```

`npm test` builds the extension and runs the unit tests. The web and desktop commands run integration tests in their respective VS Code hosts. The desktop tests download a VS Code test build by default; set `VSCODE_EXECUTABLE` to use an existing installation. On headless Linux, run them with `xvfb-run -a npm run test:desktop` (requires Xvfb).

### Package

```sh
npm run package
```

This creates `ason-vscode.vsix` in the current directory. Install it with _Extensions: Install from VSIX..._ in VS Code.

### Develop

Run `npm ci`, then press F5 to launch the **Run ASON Web Extension** configuration. Use `npm run watch` to rebuild as you edit.

### Continuous Integration

The manually triggered **Test and Package** workflow runs the tests and builds a VSIX on Ubuntu. It uploads the package as a workflow artifact and does not publish a release.

## Links

- [ASON Specification](https://github.com/hemashushu/ason/blob/main/docs/specification.md)
- [ASON Visual Studio Code Extension](https://github.com/hemashushu/ason-vscode)

## License

Licensed under MPL-2.0 with additional terms. See [LICENSE](LICENSE), [LICENSE.additional](LICENSE.additional), and [CONTRIBUTING](CONTRIBUTING). Third-party license notices are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).