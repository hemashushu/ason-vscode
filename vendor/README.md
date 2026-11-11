# Precompiled Formatter Package

`hemashushu-ason-format-wasm-1.1.1.tgz` is the npm package built by
[ason-formatter](https://github.com/hemashushu/ason-formatter). It is checked in
to bootstrap consumption before the first public npm release. It contains
precompiled WASM, JS bindings, types, build hashes and license notices, not
formatter sources. `package-lock.json` pins the archive's integrity.

Normal extension builds and tests use `npm ci`; they do not rebuild this archive
or require a formatter checkout, Cargo, Rust or wasm-bindgen.

To update the archive, run `npm pack --pack-destination ../ason-vscode/vendor`
from a tested formatter checkout, then run the following in this repository,
substituting the new version:

```sh
npm install --save-dev --save-exact ./vendor/hemashushu-ason-format-wasm-1.1.1.tgz
npm test
```

Commit the archive, dependency declaration and updated lockfile together. The
upstream package build checks that its npm and WASM crate versions match; use a
new version for changed releases instead of replacing a published version.

After the first public npm release, replace the `file:` dependency with an exact
registry version using `npm install --save-dev --save-exact
@hemashushu/ason-format-wasm@1.1.1`, update the lockfile and remove the vendored
archive. No application or build-script changes are needed.