import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundle = await build({ entryPoints: ['src/engine.ts'], bundle: true, write: false, format: 'esm', platform: 'browser' });
const { Engine, CancelledError } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const turn = () => new Promise(resolve => setImmediate(resolve));

function fixture(timeout = 1000) {
  const workers = [];
  const engine = new Engine(async () => {
    const worker = {
      sent: [], terminated: false, onmessage: null, onerror: null,
      postMessage(message) {
        if (message.type === 'init') queueMicrotask(() => this.onmessage?.({ data: { type: 'ready' } }));
        else this.sent.push(message);
      },
      terminate() { this.terminated = true; },
      complete() {
        const request = this.sent.at(-1);
        this.onmessage({ data: { type: 'result', id: request.id, result: { status: 'success', text: request.source } } });
      }
    };
    workers.push(worker);
    return { worker, wasm: new Uint8Array() };
  }, timeout);
  return { engine, workers };
}

test('engine prioritizes formatting and serializes requests', async () => {
  const { engine, workers } = fixture();
  try {
    const first = engine.validate('first');
    await turn();
    const last = engine.validate('last');
    const formatting = engine.format('format', { tabSize: 2, insertSpaces: true, crlf: false });
    const worker = workers[0];
    assert.equal(worker.sent.length, 1);
    worker.complete();
    await first;
    await turn();
    assert.equal(worker.sent[1].source, 'format');
    worker.complete();
    await formatting;
    await turn();
    assert.equal(worker.sent[2].source, 'last');
    worker.complete();
    await last;
  } finally { engine.dispose(); }
});

test('cancellation removes queued work and ignores active results', async () => {
  const { engine, workers } = fixture();
  try {
    const activeController = new AbortController();
    const active = engine.validate('active', activeController.signal);
    const activeRejected = assert.rejects(active, CancelledError);
    await turn();
    const queuedController = new AbortController();
    const queued = engine.validate('queued', queuedController.signal);
    const queuedRejected = assert.rejects(queued, CancelledError);
    queuedController.abort();
    activeController.abort();
    await Promise.all([activeRejected, queuedRejected]);
    workers[0].complete();
    await turn();
    assert.equal(workers[0].sent.length, 1);
  } finally { engine.dispose(); }
});

test('watchdog terminates worker and subsequent requests recreate it', async () => {
  const { engine, workers } = fixture(30);
  try {
    await assert.rejects(engine.validate('timeout'), /timed out/);
    assert.equal(workers[0].terminated, true);
    const recovery = engine.validate('recover');
    await turn();
    workers[0].onerror({ message: 'late error from terminated worker' });
    assert.equal(workers[1].terminated, false);
    workers[1].complete();
    assert.equal((await recovery).text, 'recover');
  } finally { engine.dispose(); }
});

test('loading failure and disposal reject outstanding operations', async () => {
  const engine = new Engine(async () => { throw new Error('missing assets'); });
  await assert.rejects(engine.validate('x'), /missing assets/);
  engine.dispose();
  await assert.rejects(engine.validate('x'), CancelledError);
});

test('a late loader from a timed-out generation cannot replace the new worker', async () => {
  const loaders = [];
  const engine = new Engine(() => new Promise(resolve => loaders.push(resolve)), 50);
  const worker = () => ({
    terminated: false, onmessage: null, onerror: null,
    terminate() { this.terminated = true; },
    postMessage(message) {
      queueMicrotask(() => this.onmessage?.({ data: message.type === 'init'
        ? { type: 'ready' }
        : { type: 'result', id: message.id, result: { status: 'success', text: message.source } } }));
    }
  });
  try {
    await assert.rejects(engine.validate('old'), /initialization timed out/);
    const recovery = engine.validate('new');
    const oldWorker = worker();
    loaders[0]({ worker: oldWorker, wasm: new Uint8Array() });
    await turn();
    assert.equal(oldWorker.terminated, true);
    loaders[1]({ worker: worker(), wasm: new Uint8Array() });
    assert.equal((await recovery).text, 'new');
  } finally { engine.dispose(); }
});