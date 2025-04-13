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
        return [['ament_cpplint'], ['ament_cppcheck'], ['ament_copyright']];
    }
    if (doc.languageId === 'python') {
        return [['ament_flake8'], ['ament_pep257'], ['ament_copyright']];
    }

    return [];
};

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

export function activate(context: vscode.ExtensionContext) {
    const collection = vscode.languages.createDiagnosticCollection('ament');
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
        const cmd = `/bin/bash -c "${toolCmd.join(' ')} ${doc.fileName}"`;

        cp.exec(cmd, { maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
            const output = stdout + stderr;
            const lines = output.split('\n');
            vscode.window.showInformationMessage(`Running ${toolName} on ${doc.fileName}`);
            vscode.window.showInformationMessage(`Output: ${lines}`);

            if (toolName === 'ament_xmllint') {
                const xmlDiagnostics = parseXmlLint(output, doc.fileName);
                collection.set(uri, xmlDiagnostics);
            }
            else
            {
                for (const line of lines) {
                    // Generic error format: file:line:col: message
                    const match = line.match(/^(.*?):(\d+):(?:(\d+):)?\s*(.*)$/);
                    if (match) {
                        const lineNum = parseInt(match[2]) - 1;
                        const colNum = match[3] ? parseInt(match[3]) - 1 : 0;
                        const message = `[${toolName}] ${match[4]}`;

                        const range = new vscode.Range(lineNum, colNum, lineNum, colNum + 1);
                        const diagnostic = new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Warning);
                        diagnostics.push(diagnostic);
                    } else if (line.includes(doc.fileName)) {
                        // fallback: show file-based error even if no line.
                        const message = `[${toolName}] ${line}`;
                        console.log(`Fallback message: ${message}`);
                        // If message starts with "Done", we can ignore it. (for ament_cpplint)
                        if (/^\s*Done/.test(line)) {
                            continue;
                        }
                        const range = new vscode.Range(0, 0, 0, 1);
                        diagnostics.push(new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Warning));
                    }
                }
                collection.set(uri, diagnostics);
            }
        });
    }
}
