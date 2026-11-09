import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Worker } from 'node:worker_threads';
import { once } from 'node:events';
import init, { formatDocument, validateDocument } from '../generated/ason.js';

await init({ module_or_path: await readFile(new URL('../generated/ason_bg.wasm', import.meta.url)) });
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