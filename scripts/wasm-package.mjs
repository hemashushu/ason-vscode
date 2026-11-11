import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function readWasmPackage(directory = dirname(fileURLToPath(import.meta.resolve('@hemashushu/ason-format-wasm/package.json')))) {
  const packageJson = JSON.parse(await readFile(resolve(directory, 'package.json'), 'utf8'));
  const info = JSON.parse(await readFile(resolve(directory, 'pkg/build-info.json'), 'utf8'));
  if (packageJson.name !== '@hemashushu/ason-format-wasm' || info.formatterVersion !== packageJson.version) {
    throw new Error('WASM package name or version mismatch. Reinstall dependencies with npm ci.');
  }
  for (const path of ['pkg/ason.js', 'pkg/ason.d.ts', 'pkg/ason_bg.wasm', 'pkg/ason_bg.wasm.d.ts', 'THIRD_PARTY_NOTICES.md', 'LICENSE', 'LICENSE.additional', 'CONTRIBUTING']) {
    if (typeof info.files?.[path] !== 'string') throw new Error(`Missing SHA-256 for ${path}. Reinstall dependencies with npm ci.`);
    const digest = createHash('sha256').update(await readFile(resolve(directory, path))).digest('hex');
    if (digest !== info.files[path]) throw new Error(`WASM package integrity check failed: ${path}. Reinstall dependencies with npm ci.`);
  }
  if (info.wasmSha256 !== info.files['pkg/ason_bg.wasm'] || info.noticesSha256 !== info.files['THIRD_PARTY_NOTICES.md']) {
    throw new Error('WASM package build metadata is inconsistent. Reinstall dependencies with npm ci.');
  }
  return { directory, info };
}