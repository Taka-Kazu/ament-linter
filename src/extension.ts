import * as vscode from 'vscode';
import * as cp from 'child_process';

const getToolsForFile = (doc: vscode.TextDocument): string[][] => {
    const fileName = doc.fileName;

    if (fileName.endsWith('.xml')) {
        return [['ament_xmllint']];
    }
    if (fileName.endsWith('CMakeLists.txt') || fileName.endsWith('.cmake')) {
        return [['ament_lint_cmake']];
    }
    if (doc.languageId === 'cpp') {
        // Uncrustify should run first.
        return [['ament_uncrustify'], ['ament_cpplint'], ['ament_cppcheck'], ['ament_copyright']];
    }
    if (doc.languageId === 'python') {
        return [['ament_flake8'], ['ament_pep257'], ['ament_copyright']];
    }

    return [];
};

function isToolEnabled(toolName: string): boolean {
    const config = vscode.workspace.getConfiguration('amentLinter');
    const tools = config.get<Record<string, boolean>>('tools');
    return tools?.[toolName] ?? true;
}

function parseXmlLint(output: string, filePath: string): vscode.Diagnostic[] {
    const diagnostics: vscode.Diagnostic[] = [];
    const lines = output.split('\n');

    const regex = new RegExp(`^${filePath}:(\\d+):\\s+parser error\\s+:\\s+(.*)$`);

    for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(regex);
        if (match) {
            const lineNum = parseInt(match[1]) - 1;
            const message = match[2];

            // Try to find the caret line and determine column
            const caretLine = lines[i + 2] || '';
            const column = caretLine.indexOf('^');
            const colNum = column >= 0 ? column : 0;

            const range = new vscode.Range(lineNum, colNum, lineNum, colNum + 1);
            diagnostics.push(new vscode.Diagnostic(range, `[ament_xmllint] ${message}`, vscode.DiagnosticSeverity.Error));
        }
    }

    return diagnostics;
}

function parseGenericLint(output: string, filePath: string): vscode.Diagnostic[] {
    const diagnostics: vscode.Diagnostic[] = [];
    const lines = output.split('\n');
    const regex = new RegExp(`^${filePath}:(\\d+):\\s+(.*)$`);
    for (const line of lines) {
        const match = line.match(regex);
        if (match) {
            const lineNum = parseInt(match[1]) - 1;
            const message = match[2];
            const range = new vscode.Range(lineNum, 0, lineNum, 1);
            diagnostics.push(new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Warning));
        } else if (line.includes(filePath)) {
            // fallback: show file-based error even if no line.
            const message = line;
            console.log(`Fallback message: ${message}`);
            // If message starts with "Done", we can ignore it. (for ament_cpplint)
            if (/^\s*Done/.test(line)) {
                continue;
            }
            const range = new vscode.Range(0, 0, 0, 1);
            diagnostics.push(new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Warning));
        }
    }
    return diagnostics;
}

export function activate(context: vscode.ExtensionContext) {
    const collection = vscode.languages.createDiagnosticCollection('amentLinter');
    context.subscriptions.push(collection);
    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(doc => {
        runLinter(doc, collection);
    }));
    if (vscode.window.activeTextEditor) {
        runLinter(vscode.window.activeTextEditor.document, collection);
    }
}

export function runLinter(doc: vscode.TextDocument, collection: vscode.DiagnosticCollection) {
    const uri = doc.uri;
    const diagnostics: vscode.Diagnostic[] = [];

    const tools = getToolsForFile(doc);
    if (tools.length === 0) {
        collection.set(uri, []);
        return;
    }

    for (const toolCmd of tools) {
        const toolName = toolCmd[0];
         if (!isToolEnabled(toolName)) {
            console.log(`[ament-linter] Skipped ${toolName} (disabled in settings)`);
            continue;
        }
        if (toolName === 'ament_uncrustify') {
            const cmd = `/bin/bash -c "${toolCmd.join(' ')} --reformat ${doc.fileName}"`;
            cp.exec(cmd, { maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
                if (err && !/with code style divergence/.test(err.message)) {
                    vscode.window.showErrorMessage(`Error running ${toolName}: ${err.message}`);
                }
            });
            continue;
        }

        const cmd = `/bin/bash -c "${toolCmd.join(' ')} ${doc.fileName}"`;

        cp.exec(cmd, { maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
            const output = stdout + stderr;
            if (toolName === 'ament_xmllint') {
                const xmlDiagnostics = parseXmlLint(output, doc.fileName);
                collection.set(uri, xmlDiagnostics);
            }
            else
            {
                const diagnostics = parseGenericLint(output, doc.fileName);
                collection.set(uri, diagnostics);
            }
        });
    }
}
