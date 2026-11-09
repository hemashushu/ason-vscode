import * as vscode from 'vscode';
import { CancelledError, Engine } from './engine';
import { Diagnostics } from './diagnostics';

export function registerFormatting(engine: Engine, diagnostics: Diagnostics): vscode.Disposable {
    return vscode.languages.registerDocumentFormattingEditProvider('ason', {
        async provideDocumentFormattingEdits(document, options, token) {
            if (token.isCancellationRequested) return [];
            const version = document.version;
            const source = document.getText();
            const controller = new AbortController();
            const subscription = token.onCancellationRequested(() => controller.abort());
            try {
                const result = await engine.format(source, {
                    tabSize: Math.min(256, Math.max(1, Math.trunc(options.tabSize))),
                    insertSpaces: options.insertSpaces,
                    crlf: document.eol === vscode.EndOfLine.CRLF
                }, controller.signal);
                if (token.isCancellationRequested || document.isClosed || document.version !== version || document.languageId !== 'ason') return [];
                diagnostics.apply(document, version, result);
                if (result.status === 'error') throw new Error(`Cannot format ASON: ${result.error.message}`);
                if (result.text === null || result.text === source) return [];
                return [vscode.TextEdit.replace(new vscode.Range(document.positionAt(0), document.positionAt(source.length)), result.text)];
            } catch (error) {
                if (error instanceof CancelledError || token.isCancellationRequested) return [];
                throw error;
            } finally {
                subscription.dispose();
            }
        }
    });
}