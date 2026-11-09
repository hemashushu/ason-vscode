import * as vscode from 'vscode';
import { CancelledError, Engine } from './engine';
import type { EngineResult } from './protocol';

export class Diagnostics implements vscode.Disposable {
    private readonly collection = vscode.languages.createDiagnosticCollection('ason');
    private readonly pending = new Map<string, { controller: AbortController; timer: ReturnType<typeof setTimeout> }>();
    private disposed = false;

    constructor(private readonly engine: Engine, private readonly output: vscode.OutputChannel) {}

    schedule(document: vscode.TextDocument): void {
        const key = document.uri.toString();
        this.clear(document.uri);
        const settings = vscode.workspace.getConfiguration('ason.validation', document.uri);
        if (this.disposed || document.isClosed || document.languageId !== 'ason' || !settings.get<boolean>('enabled', true)) return;
        const source = document.getText();
        if (new TextEncoder().encode(source).byteLength > settings.get<number>('maxFileSize', 2097152)) {
            this.output.appendLine('Automatic validation skipped: document exceeds ason.validation.maxFileSize.');
            return;
        }
        const version = document.version;
        const controller = new AbortController();
        const timer = setTimeout(() => {
            void this.engine.validate(source, controller.signal).then(result => {
                if (!controller.signal.aborted) this.apply(document, version, result);
            }).catch(error => {
                if (!(error instanceof CancelledError)) this.output.appendLine('ASON validation unavailable: background engine failed.');
            }).finally(() => {
                if (this.pending.get(key)?.controller === controller) this.pending.delete(key);
            });
        }, settings.get<number>('delay', 300));
        this.pending.set(key, { controller, timer });
    }

    apply(document: vscode.TextDocument, version: number, result: EngineResult): void {
        if (this.disposed || document.isClosed || document.languageId !== 'ason' || document.version !== version) return;
        if (!vscode.workspace.getConfiguration('ason.validation', document.uri).get<boolean>('enabled', true)) return;
        if (result.status === 'success') {
            this.collection.delete(document.uri);
            return;
        }
        const error = result.error;
        const range = error.start === null || error.end === null
            ? document.lineAt(0).range
            : new vscode.Range(document.positionAt(error.start), document.positionAt(error.end));
        const message = error.kind === 'document' ? `Document validation: ${error.message}` : error.message;
        const diagnostic = new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Error);
        diagnostic.source = 'ASON';
        diagnostic.code = error.kind;
        this.collection.set(document.uri, [diagnostic]);
    }

    clear(uri: vscode.Uri): void {
        const key = uri.toString();
        const pending = this.pending.get(key);
        if (pending) {
            clearTimeout(pending.timer);
            pending.controller.abort();
            this.pending.delete(key);
        }
        this.collection.delete(uri);
    }

    dispose(): void {
        this.disposed = true;
        for (const pending of this.pending.values()) {
            clearTimeout(pending.timer);
            pending.controller.abort();
        }
        this.pending.clear();
        this.collection.dispose();
    }
}