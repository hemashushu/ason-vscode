import init, { formatDocument, validateDocument } from '../generated/ason.js';
import type { EngineReply, EngineRequest, EngineResult } from './protocol';

function reply(message: EngineReply): void {
    postMessage(message);
}

self.onmessage = async (event: MessageEvent<EngineRequest>) => {
    try {
        const request = event.data;
        if (request.type === 'init') {
            await init({ module_or_path: request.wasm });
            reply({ type: 'ready' });
            return;
        }
        const raw = request.type === 'format'
            ? formatDocument(request.source, request.options.tabSize, request.options.insertSpaces, request.options.crlf)
            : validateDocument(request.source);
        const result = JSON.parse(raw) as EngineResult;
        reply({ type: 'result', id: request.id, result });
    } catch (error) {
        reply({ type: 'fatal', message: error instanceof Error ? error.message : 'ASON engine failed.' });
    }
};