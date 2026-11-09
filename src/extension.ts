import * as vscode from 'vscode';
import { Engine } from './engine';
import { Diagnostics } from './diagnostics';
import { registerFormatting } from './formatting';

export function activate(context: vscode.ExtensionContext): void {
    const output = vscode.window.createOutputChannel('ASON');
    const engine = new Engine(async () => {
        const [script, wasm] = await Promise.all([
            vscode.workspace.fs.readFile(vscode.Uri.joinPath(context.extensionUri, 'dist', 'engine.worker.js')),
            vscode.workspace.fs.readFile(vscode.Uri.joinPath(context.extensionUri, 'dist', 'ason_bg.wasm'))
        ]);
        const url = URL.createObjectURL(new Blob([new TextDecoder().decode(script)], { type: 'text/javascript' }));
        try {
            const worker = new Worker(url, { name: 'ASON engine' });
            return { worker, wasm, dispose: () => URL.revokeObjectURL(url) };
        } catch (error) {
            URL.revokeObjectURL(url);
            throw error;
        }
    });
    const diagnostics = new Diagnostics(engine, output);
    context.subscriptions.push(output, engine, diagnostics, registerFormatting(engine, diagnostics),
        vscode.workspace.onDidOpenTextDocument(document => diagnostics.schedule(document)),
        vscode.workspace.onDidChangeTextDocument(event => diagnostics.schedule(event.document)),
        vscode.workspace.onDidCloseTextDocument(document => diagnostics.clear(document.uri)),
        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('ason.validation')) {
                for (const document of vscode.workspace.textDocuments) diagnostics.schedule(document);
            }
        })
    );
    for (const document of vscode.workspace.textDocuments) diagnostics.schedule(document);
}