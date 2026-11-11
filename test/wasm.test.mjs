import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { once } from 'node:events';
import init, { formatDocument, validateDocument } from '@hemashushu/ason-format-wasm';
import { readWasmPackage } from '../scripts/wasm-package.mjs';

await init({ module_or_path: await readFile(new URL(import.meta.resolve('@hemashushu/ason-format-wasm/ason_bg.wasm'))) });
const format = (source, spaces = true, crlf = false) => JSON.parse(formatDocument(source, 2, spaces, crlf));

test('WASM keeps literals/comments intact with all structural layouts', () => {
  const source = '{a:"one\n two", /* c\r\n d */ b:r##"raw\r\ntext"##}';
  for (const spaces of [true, false]) for (const crlf of [true, false]) {
    const result = format(source, spaces, crlf);
    assert.equal(result.status, 'success');
    for (const literal of ['"one\n two"', '/* c\r\n d */', 'r##"raw\r\ntext"##']) assert.ok(result.text.includes(literal));
    assert.equal(format(result.text, spaces, crlf).text, result.text);
    assert.ok(result.text.includes(`${crlf ? '\r\n' : '\n'}${spaces ? '  ' : '\t'}a:`));
  }
});

test('WASM structured diagnostics use UTF-16 exclusive ranges', () => {
  const source = '{😀:1\r\n😀:2}';
  const result = JSON.parse(validateDocument(source));
  assert.equal(result.status, 'error');
  assert.equal(source.slice(result.error.start, result.error.end), '😀');
  assert.equal(result.error.start, '{😀:1\r\n'.length);
  assert.equal(JSON.parse(validateDocument('[1 true]')).error.kind, 'document');
  assert.equal(JSON.parse(validateDocument('[')).error.start, 1);
  for (const value of ['d"2024-03-16T16:30:50+08:00"', '0x1.8p+2_f64', 'Option::Some("中")']) assert.equal(JSON.parse(validateDocument(value)).status, 'success');
});

test('WASM validates and preserves enum shorthands', () => {
  for (const value of ['Some(11)', 'None', 'Ok(11)', 'Err("failed")', 'Some(Ok([11,13,17]))', 'Result::Ok(Some(11))', 'Option::None']) {
    assert.equal(JSON.parse(validateDocument(value)).status, 'success', value);
    const result = format(value);
    assert.equal(result.status, 'success', value);
    assert.equal(JSON.parse(validateDocument(result.text)).status, 'success', value);
    assert.equal(format(result.text).text, result.text, value);
    assert.ok(result.text.startsWith(value.split('(')[0]), value);
  }
  for (const key of ['Some', 'None', 'Ok', 'Err']) {
    assert.equal(JSON.parse(validateDocument(`{${key}: 1}`)).status, 'error', key);
  }
  for (const key of ['some', 'NONE', 'ok', 'ERR', 'SomeValue']) {
    assert.equal(JSON.parse(validateDocument(`{${key}: 1}`)).status, 'success', key);
  }
});

test('build copies verified npm package WASM and license notices', async () => {
  const { info } = await readWasmPackage();
  const builtInfo = JSON.parse(await readFile(new URL('../dist/build-info.json', import.meta.url), 'utf8'));
  assert.deepEqual(builtInfo, info);
  for (const [path, expected] of [['../dist/ason_bg.wasm', info.wasmSha256], ['../THIRD_PARTY_NOTICES.md', info.noticesSha256]]) {
    assert.equal(createHash('sha256').update(await readFile(new URL(path, import.meta.url))).digest('hex'), expected);
  }
});

test('build rejects mismatched bindings and incomplete package metadata', async () => {
  const { directory, info } = await readWasmPackage();
  const temporary = await mkdtemp(join(tmpdir(), 'ason-vscode-wasm-'));
  try {
    await cp(directory, temporary, { recursive: true });
    const bindings = join(temporary, 'pkg/ason.js');
    const original = await readFile(bindings);
    await writeFile(bindings, '// mismatched bindings\n');
    await assert.rejects(readWasmPackage(temporary), /integrity check failed: pkg\/ason.js/);
    await writeFile(bindings, original);
    const { ['pkg/ason.js']: omitted, ...files } = info.files;
    await writeFile(join(temporary, 'pkg/build-info.json'), JSON.stringify({ ...info, files }));
    await assert.rejects(readWasmPackage(temporary), /Missing SHA-256 for pkg\/ason.js/);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test('bundled worker initializes and returns real WASM results', { timeout: 10000 }, async () => {
  const source = await readFile(new URL('../dist/engine.worker.js', import.meta.url), 'utf8');
  const worker = new Worker(`const { parentPort } = require('node:worker_threads'); globalThis.self = globalThis; globalThis.postMessage = value => parentPort.postMessage(value); ${source}\nparentPort.on('message', data => self.onmessage({data}));`, { eval: true });
  try {
    const ready = once(worker, 'message');
    worker.postMessage({ type: 'init', wasm: await readFile(new URL('../dist/ason_bg.wasm', import.meta.url)) });
    assert.equal((await ready)[0].type, 'ready');
    const reply = once(worker, 'message');
    worker.postMessage({ type: 'format', id: 1, source: '{a:1}', options: { tabSize: 2, insertSpaces: true, crlf: false } });
    assert.equal((await reply)[0].result.text, '{a: 1}\n');
  } finally { await worker.terminate(); }
});