export interface DocumentError {
    message: string;
    kind: 'syntax' | 'eof' | 'document';
    start: number | null;
    end: number | null;
}

export type EngineResult =
    | { status: 'success'; text: string | null }
    | { status: 'error'; error: DocumentError };

export interface LayoutOptions {
    tabSize: number;
    insertSpaces: boolean;
    crlf: boolean;
}

export type EngineRequest =
    | { type: 'init'; wasm: ArrayBuffer }
    | { type: 'format'; id: number; source: string; options: LayoutOptions }
    | { type: 'validate'; id: number; source: string };

export type EngineReply =
    | { type: 'ready' }
    | { type: 'result'; id: number; result: EngineResult }
    | { type: 'fatal'; message: string };