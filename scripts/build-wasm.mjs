import { spawnSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argument = process.argv.indexOf('--formatter-dir');
const formatter = argument >= 0 ? process.argv[argument + 1] : process.env.ASON_FORMATTER_DIR;
if (!formatter) throw new Error('Provide --formatter-dir <ason-formatter checkout> or ASON_FORMATTER_DIR. See README.');
const manifest = resolve(formatter, 'Cargo.toml');
const version = '0.2.130';
function run(command, args, capture = false) {
  const result = spawnSync(command, args, { encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit' });
  if (result.error || result.status !== 0) throw new Error(`${command} failed: ${result.error?.message ?? result.stderr ?? result.status}`);
  return result.stdout?.trim();
}
const bindingVersion = run('wasm-bindgen', ['--version'], true);
if (bindingVersion !== `wasm-bindgen ${version}`) throw new Error(`Install wasm-bindgen-cli ${version}: cargo install wasm-bindgen-cli --version ${version} --locked`);
run('cargo', ['build', '--manifest-path', manifest, '-p', 'ason-format-wasm', '--target', 'wasm32-unknown-unknown', '--release', '--locked']);
const metadata = JSON.parse(run('cargo', ['metadata', '--manifest-path', manifest, '--filter-platform', 'wasm32-unknown-unknown', '--format-version', '1', '--locked'], true));
const artifact = resolve(metadata.target_directory, 'wasm32-unknown-unknown/release/ason_format_wasm.wasm');
const output = resolve(root, 'generated');
await mkdir(output, { recursive: true });
run('wasm-bindgen', [artifact, '--target', 'web', '--out-dir', output, '--out-name', 'ason']);
const wasm = await readFile(resolve(output, 'ason_bg.wasm'));
const sourceHash = createHash('sha256');
for (const path of ['Cargo.toml', 'Cargo.lock', 'crates/ason-format/Cargo.toml', 'crates/ason-format/src/lib.rs', 'crates/ason-format/src/format.rs', 'crates/ason-format/src/highlight.rs', 'crates/ason-format-wasm/Cargo.toml', 'crates/ason-format-wasm/src/lib.rs']) {
  sourceHash.update(path).update(await readFile(resolve(formatter, path)));
}
const buildInfo = {
  rust: run('rustc', ['--version'], true),
  wasmBindgen: bindingVersion,
  wasmSha256: createHash('sha256').update(wasm).digest('hex'),
  formatterSourceSha256: sourceHash.digest('hex'),
  cargoLockSha256: createHash('sha256').update(await readFile(resolve(formatter, 'Cargo.lock'))).digest('hex')
};
const packages = new Map(metadata.packages.map(packageInfo => [packageInfo.id, packageInfo]));
const nodes = new Map(metadata.resolve.nodes.map(node => [node.id, node]));
const bridge = metadata.packages.find(packageInfo => packageInfo.name === 'ason-format-wasm');
if (!bridge) throw new Error('Formatter checkout does not contain ason-format-wasm.');
const dependencies = new Set();
function visit(id) {
  if (dependencies.has(id)) return;
  dependencies.add(id);
  for (const dependency of nodes.get(id)?.dependencies ?? []) visit(dependency);
}
visit(bridge.id);
const licenses = new Map();
const lines = ['# Bundled ASON WASM Dependency Notices', '', 'Generated from the locked formatter source, including build dependencies.', 'The extension runtime bundles no npm libraries. The generated WebAssembly bindings are covered by the wasm-bindgen notices below.', ''];
for (const id of [...dependencies].sort()) {
  const packageInfo = packages.get(id);
  const directory = dirname(packageInfo.manifest_path);
  const files = (await readdir(directory, { withFileTypes: true }))
    .filter(entry => entry.isFile() && /^(LICENSE|COPYING|NOTICE|UNLICENSE)([.\-_]|$)/i.test(entry.name))
    .map(entry => resolve(directory, entry.name));
  if (packageInfo.license_file) files.push(resolve(directory, packageInfo.license_file));
  if (packageInfo.name === 'hexfloat2' && packageInfo.version === '0.2.0' && packageInfo.license === 'MIT' && files.length === 0) {
    files.push(resolve(root, 'scripts/licenses/hexfloat2-0.2.0.txt'));
  }
  if (files.length === 0) throw new Error(`Missing license texts for ${packageInfo.name}; review before distributing.`);
  lines.push(`- ${packageInfo.name} ${packageInfo.version}: ${packageInfo.license ?? 'see license text'}`);
  for (const file of new Set(files)) {
    const text = await readFile(file, 'utf8');
    const hash = createHash('sha256').update(text).digest('hex');
    const item = licenses.get(hash) ?? { names: new Set(), text };
    item.names.add(`${packageInfo.name} ${packageInfo.version}`);
    licenses.set(hash, item);
  }
}
for (const { names, text } of licenses.values()) lines.push('', `## ${[...names].join(', ')}`, '', text);
const notices = lines.join('\n') + '\n';
await writeFile(resolve(root, 'THIRD_PARTY_NOTICES.md'), notices);
await writeFile(resolve(output, 'build-info.json'), JSON.stringify({
  ...buildInfo,
  noticesSha256: createHash('sha256').update(notices).digest('hex')
}, null, 2) + '\n');
console.log(`Built packaged ASON WASM (${wasm.length} bytes).`);