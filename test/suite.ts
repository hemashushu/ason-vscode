import * as vscode from 'vscode';

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}

function assertText(document: vscode.TextDocument, expected: string): void {
    const text = document.getText();
    const expectedText = document.eol === vscode.EndOfLine.CRLF ? expected.replaceAll('\n', '\r\n') : expected;
    assert(text === expectedText, `Expected ${JSON.stringify(expectedText)}, got ${JSON.stringify(text)}`);
}

async function format(document: vscode.TextDocument, options = { tabSize: 2, insertSpaces: true }): Promise<void> {
    const edits = await vscode.commands.executeCommand<vscode.TextEdit[]>('vscode.executeFormatDocumentProvider', document.uri, options);
    assert(edits, 'Formatting provider returns edits');
    const change = new vscode.WorkspaceEdit();
    change.set(document.uri, edits);
    assert(await vscode.workspace.applyEdit(change), 'Formatting edits apply');
}

async function replace(document: vscode.TextDocument, source: string): Promise<void> {
    const change = new vscode.WorkspaceEdit();
    change.replace(document.uri, new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), source);
    assert(await vscode.workspace.applyEdit(change), 'Document edit applies');
}

function waitForDiagnostics(document: vscode.TextDocument, predicate: (diagnostics: readonly vscode.Diagnostic[]) => boolean): Promise<readonly vscode.Diagnostic[]> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            subscription.dispose();
            reject(new Error(`Diagnostic timeout: ${JSON.stringify(vscode.languages.getDiagnostics(document.uri))}`));
        }, 15000);
        const check = () => {
            const diagnostics = vscode.languages.getDiagnostics(document.uri).filter(diagnostic => diagnostic.source === 'ASON');
            if (predicate(diagnostics)) {
                clearTimeout(timer);
                subscription.dispose();
                resolve(diagnostics);
            }
        };
        const subscription = vscode.languages.onDidChangeDiagnostics(event => {
            if (event.uris.some(uri => uri.toString() === document.uri.toString())) check();
        });
        check();
    });
}

const cases: [string, () => Promise<void>][] = [
    ['formatting and idempotence', async () => {
        const document = await vscode.workspace.openTextDocument({ language: 'ason', content: '{answer:0x2a}' });
        await format(document);
        assertText(document, '{answer: 0x2a}\n');
        const edits = await vscode.commands.executeCommand<vscode.TextEdit[]>('vscode.executeFormatDocumentProvider', document.uri, { tabSize: 2, insertSpaces: true });
        assert(!edits?.length, 'Already formatted document has no edits');
    }],
    ['enum shorthand formatting and diagnostics', async () => {
        const document = await vscode.workspace.openTextDocument({ language: 'ason', content: '{Some:1}' });
        await waitForDiagnostics(document, diagnostics => diagnostics.length === 1);
        await replace(document, '{value:Some(Ok(11)) empty:None}');
        await waitForDiagnostics(document, diagnostics => diagnostics.length === 0);
        await format(document);
        assertText(document, '{value: Some(Ok(11)) empty: None}\n');
    }],
    ['tab indentation and CRLF', async () => {
        const document = await vscode.workspace.openTextDocument({ language: 'ason', content: '{// note\r\na:1}' });
        assert(document.eol === vscode.EndOfLine.CRLF, 'Input uses CRLF');
        await format(document, { tabSize: 4, insertSpaces: false });
        assert(document.getText() === '{\r\n\t// note\r\n\ta: 1\r\n}\r\n', JSON.stringify(document.getText()));
    }],
    ['Unicode diagnostics update and clear after correction', async () => {
        const document = await vscode.workspace.openTextDocument({ language: 'ason', content: '{😀:1\r\n😀:2}' });
        const diagnostics = await waitForDiagnostics(document, diagnostics => diagnostics.length === 1);
        const range = diagnostics[0].range;
        assert(range.start.line === 1 && range.start.character === 0 && range.end.character === 2, JSON.stringify(range));
        assert(document.getText(range) === '😀', 'Diagnostic selects second emoji identifier');
        await replace(document, '{😀:1}');
        await waitForDiagnostics(document, diagnostics => diagnostics.length === 0);
        await replace(document, '[1 true]');
        await waitForDiagnostics(document, diagnostics => diagnostics[0]?.code === 'document');
        await replace(document, '[');
        const eof = await waitForDiagnostics(document, diagnostics => diagnostics[0]?.code === 'eof');
        assert(eof[0].range.start.character === 1, 'EOF diagnostic points at document end');
        await replace(document, '[]');
        await waitForDiagnostics(document, diagnostics => diagnostics.length === 0);
    }],
    ['invalid formatting never changes input', async () => {
        const document = await vscode.workspace.openTextDocument({ language: 'ason', content: '{a:1 a:2}' });
        const edits = await vscode.commands.executeCommand<vscode.TextEdit[]>('vscode.executeFormatDocumentProvider', document.uri, { tabSize: 2, insertSpaces: true });
        assert(!edits?.length, 'Invalid document has no formatting edits');
        assert(document.getText() === '{a:1 a:2}', 'Invalid document remains unchanged');
        await waitForDiagnostics(document, diagnostics => diagnostics.length === 1);
    }],
    ['language changes discard diagnostics', async () => {
        const document = await vscode.workspace.openTextDocument({ language: 'ason', content: '[' });
        await waitForDiagnostics(document, diagnostics => diagnostics.length === 1);
        await vscode.languages.setTextDocumentLanguage(document, 'plaintext');
        await waitForDiagnostics(document, diagnostics => diagnostics.length === 0);
    }],
    ['validation disable and size limit', async () => {
        const document = await vscode.workspace.openTextDocument({ language: 'ason', content: '[' });
        const settings = vscode.workspace.getConfiguration('ason.validation', document.uri);
        const originalEnabled = settings.inspect('enabled')?.workspaceValue;
        const originalLimit = settings.inspect('maxFileSize')?.workspaceValue;
        try {
            await waitForDiagnostics(document, diagnostics => diagnostics.length === 1);
            await settings.update('enabled', false, vscode.ConfigurationTarget.Workspace);
            await waitForDiagnostics(document, diagnostics => diagnostics.length === 0);
            await settings.update('enabled', true, vscode.ConfigurationTarget.Workspace);
            await waitForDiagnostics(document, diagnostics => diagnostics.length === 1);
            await settings.update('maxFileSize', 0, vscode.ConfigurationTarget.Workspace);
            await waitForDiagnostics(document, diagnostics => diagnostics.length === 0);
            const valid = await vscode.workspace.openTextDocument({ language: 'ason', content: '{a:1}' });
            await format(valid);
            assertText(valid, '{a: 1}\n');
        } finally {
            await settings.update('enabled', originalEnabled, vscode.ConfigurationTarget.Workspace);
            await settings.update('maxFileSize', originalLimit, vscode.ConfigurationTarget.Workspace);
        }
    }],
    ['rapid changes do not leave stale diagnostics', async () => {
        const document = await vscode.workspace.openTextDocument({ language: 'ason', content: '[' });
        await waitForDiagnostics(document, diagnostics => diagnostics.length === 1);
        for (const source of ['{', '{a:1}', '[true 1]', '[]']) await replace(document, source);
        await waitForDiagnostics(document, diagnostics => diagnostics.length === 0);
        await new Promise(resolve => setTimeout(resolve, 600));
        assert(vscode.languages.getDiagnostics(document.uri).length === 0, 'Stale diagnostics never reappear');
    }],
    ['file association and format on save', async () => {
        const folder = vscode.workspace.workspaceFolders?.[0];
        assert(folder, 'Test workspace exists');
        const uri = vscode.Uri.joinPath(folder.uri, '__ason_save_test.ason');
        try {
            await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode('{a:1}'));
            const document = await vscode.workspace.openTextDocument(uri);
            assert(document.languageId === 'ason', '.ason association is registered');
            await vscode.window.showTextDocument(document);
            await replace(document, '{a:2}');
            assert(await document.save(), 'Document saves');
            assertText(document, '{a: 2}\n');
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            await waitForDiagnostics(document, diagnostics => diagnostics.length === 0);
        } finally {
            await vscode.workspace.fs.delete(uri);
        }
    }]
];

export async function run(): Promise<void> {
    const extension = vscode.extensions.getExtension('hemashushu.ason-vscode');
    assert(extension, 'Extension is installed');
    await extension.activate();
    for (const [name, run] of cases) {
        await run();
        console.log(`PASS ASON host: ${name}`);
    }
    console.log(`${cases.length} ASON host tests passed.`);
}