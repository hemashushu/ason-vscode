import { build, context } from 'esbuild';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const info = JSON.parse(await readFile('generated/build-info.json', 'utf8'));
const hash = data => createHash('sha256').update(data).digest('hex');
if (hash(await readFile('generated/ason_bg.wasm')) !== info.wasmSha256 || hash(await readFile('THIRD_PARTY_NOTICES.md')) !== info.noticesSha256) {
  throw new Error('Generated WASM/notices are incomplete or stale. Run npm run build:wasm first.');
}
await mkdir('dist', { recursive: true });
await copyFile('generated/ason_bg.wasm', 'dist/ason_bg.wasm');
await copyFile('generated/build-info.json', 'dist/build-info.json');
const common = { bundle: true, platform: 'browser', target: 'es2022', sourcemap: true, logLevel: 'info' };
const workerGuard = {
  name: 'worker-runtime-guard',
  setup(builder) {
    builder.onResolve({ filter: /^(vscode|node:.*)$/ }, args => ({ errors: [{ text: `Worker cannot import ${args.path}` }] }));
  }
};
const configurations = [
  { ...common, entryPoints: ['src/extension.ts'], outfile: 'dist/extension.cjs', format: 'cjs', external: ['vscode'] },
  { ...common, entryPoints: ['src/engine.worker.ts'], outfile: 'dist/engine.worker.js', format: 'iife', plugins: [workerGuard], define: { 'import.meta.url': '""' } },
  { ...common, entryPoints: ['test/suite.ts'], outfile: 'dist/test/suite.cjs', format: 'cjs', external: ['vscode'] }
];
if (process.argv.includes('--watch')) {
  for (const configuration of configurations) await (await context(configuration)).watch();
} else {
  await Promise.all(configurations.map(configuration => build(configuration)));
}