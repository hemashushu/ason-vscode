import { build, context } from 'esbuild';
import { copyFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { readWasmPackage } from './scripts/wasm-package.mjs';

const { directory } = await readWasmPackage();
await mkdir('dist', { recursive: true });
await copyFile(resolve(directory, 'pkg/ason_bg.wasm'), 'dist/ason_bg.wasm');
await copyFile(resolve(directory, 'pkg/build-info.json'), 'dist/build-info.json');
await copyFile(resolve(directory, 'THIRD_PARTY_NOTICES.md'), 'THIRD_PARTY_NOTICES.md');
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