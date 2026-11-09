import type { EngineReply, EngineRequest, EngineResult, LayoutOptions } from './protocol';

export class CancelledError extends Error {
    constructor() { super('ASON request cancelled.'); }
}

interface Job {
    request: Exclude<EngineRequest, { type: 'init' }>;
    resolve: (result: EngineResult) => void;
    reject: (error: Error) => void;
    cleanup: () => void;
    signal?: AbortSignal;
}

export type EngineLoader = () => Promise<{ worker: Worker; wasm: Uint8Array; dispose?: () => void }>;

export class Engine {
    private worker?: Worker;
    private ready?: Promise<void>;
    private initializationReject?: (error: Error) => void;
    private releaseResources?: () => void;
    private queue: Job[] = [];
    private active?: Job;
    private sequence = 0;
    private generation = 0;
    private pumping = false;
    private disposed = false;
    private timer?: ReturnType<typeof setTimeout>;

    constructor(private readonly load: EngineLoader, private readonly timeout = 10000) {}

    format(source: string, options: LayoutOptions, signal?: AbortSignal): Promise<EngineResult> {
        return this.request({ type: 'format', id: ++this.sequence, source, options }, signal);
    }

    validate(source: string, signal?: AbortSignal): Promise<EngineResult> {
        return this.request({ type: 'validate', id: ++this.sequence, source }, signal);
    }

    private request(request: Job['request'], signal?: AbortSignal): Promise<EngineResult> {
        if (this.disposed || signal?.aborted) return Promise.reject(new CancelledError());
        return new Promise((resolve, reject) => {
            const abort = () => {
                const index = this.queue.indexOf(job);
                if (index >= 0) this.queue.splice(index, 1);
                job.cleanup();
                reject(new CancelledError());
            };
            const job: Job = { request, resolve, reject, signal, cleanup: () => signal?.removeEventListener('abort', abort) };
            signal?.addEventListener('abort', abort, { once: true });
            if (request.type === 'format') {
                const index = this.queue.findIndex(queued => queued.request.type === 'validate');
                this.queue.splice(index < 0 ? this.queue.length : index, 0, job);
            } else {
                this.queue.push(job);
            }
            void this.pump();
        });
    }

    private async initialize(): Promise<void> {
        if (this.ready) return this.ready;
        const generation = this.generation;
        this.ready = new Promise<void>((resolve, reject) => {
            this.initializationReject = reject;
            this.timer = setTimeout(() => this.fail(new Error('ASON engine initialization timed out.')), this.timeout);
            void this.load().then(({ worker, wasm, dispose }) => {
                if (this.disposed || generation !== this.generation || !this.initializationReject) {
                    worker.terminate();
                    dispose?.();
                    return;
                }
                this.worker = worker;
                this.releaseResources = dispose;
                worker.onmessage = (event: MessageEvent<EngineReply>) => {
                    if (generation !== this.generation) return;
                    const reply = event.data;
                    if (reply.type === 'ready') {
                        clearTimeout(this.timer);
                        this.initializationReject = undefined;
                        resolve();
                    } else if (reply.type === 'fatal') {
                        this.fail(new Error(reply.message));
                    } else if (this.active?.request.id === reply.id) {
                        clearTimeout(this.timer);
                        const job = this.active;
                        this.active = undefined;
                        job.cleanup();
                        if (!job.signal?.aborted) job.resolve(reply.result);
                        void this.pump();
                    }
                };
                worker.onerror = event => {
                    if (generation === this.generation) this.fail(new Error(`ASON background worker failed: ${event.message || 'worker could not be loaded'}`));
                };
                const buffer = wasm.slice().buffer as ArrayBuffer;
                worker.postMessage({ type: 'init', wasm: buffer } satisfies EngineRequest, [buffer]);
            }).catch(error => {
                if (generation === this.generation) this.fail(error instanceof Error ? error : new Error('Cannot load ASON engine.'));
            });
        });
        return this.ready;
    }

    private async pump(): Promise<void> {
        if (this.pumping || this.active || this.disposed || this.queue.length === 0) return;
        this.pumping = true;
        const generation = this.generation;
        try {
            await this.initialize();
            if (this.disposed) return;
            const job = this.queue.shift();
            if (!job) return;
            this.active = job;
            this.timer = setTimeout(() => this.fail(new Error('ASON operation timed out; the background worker was restarted.')), this.timeout);
            this.worker!.postMessage(job.request);
        } catch (error) {
            if (generation === this.generation) this.fail(error instanceof Error ? error : new Error('Cannot initialize ASON engine.'));
        } finally {
            this.pumping = false;
            if (!this.active && this.queue.length > 0) void this.pump();
        }
    }

    private fail(error: Error): void {
        this.generation++;
        clearTimeout(this.timer);
        const rejectInitialization = this.initializationReject;
        this.initializationReject = undefined;
        this.worker?.terminate();
        this.worker = undefined;
        this.releaseResources?.();
        this.releaseResources = undefined;
        this.ready = undefined;
        const jobs = this.active ? [this.active, ...this.queue] : this.queue;
        this.active = undefined;
        this.queue = [];
        for (const job of jobs) {
            job.cleanup();
            job.reject(error);
        }
        rejectInitialization?.(error);
    }

    dispose(): void {
        this.disposed = true;
        this.fail(new CancelledError());
    }
}