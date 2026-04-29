import * as vscode from 'vscode';
import * as formatter from './formatter';

export function activate(context: vscode.ExtensionContext) {
	const selector: vscode.DocumentSelector = { language: 'python', scheme: 'file' };

	const provider: vscode.DocumentFormattingEditProvider = {
		provideDocumentFormattingEdits: async (document: vscode.TextDocument) => {
			// If there are any Python diagnostics with severity Error, skip formatting to avoid worsening syntax state
			const diags = vscode.languages.getDiagnostics(document.uri) || [];
			if (diags.some(d => d.severity === vscode.DiagnosticSeverity.Error)) {
				vscode.window.showWarningMessage('Skipping formatting: document has syntax errors');
				return [];
			}

			const fullText = document.getText();
			let formatted = fullText;
			try {
				formatted = await formatter.formatWithSystemFormatter(fullText);
			} catch (e) {
				vscode.window.showWarningMessage('Formatting failed — leaving document unchanged');
				formatted = fullText;
			}

			const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(fullText.length));
			return [vscode.TextEdit.replace(fullRange, formatted)];
		}
	};

	context.subscriptions.push(vscode.languages.registerDocumentFormattingEditProvider(selector, provider));

	// No model initialization needed - uses system formatters or built-in fallback

	const disposable = vscode.commands.registerCommand('python-formatter.format', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showInformationMessage('No active editor to format');
			return;
		}
		if (editor.document.languageId !== 'python') {
			vscode.window.showInformationMessage('Active document is not Python');
			return;
		}

		const doc = editor.document;
		// If there are any Python diagnostics with severity Error, warn and ask before formatting
		const diags = vscode.languages.getDiagnostics(doc.uri) || [];
		if (diags.some(d => d.severity === vscode.DiagnosticSeverity.Error)) {
			const pick = await vscode.window.showWarningMessage('Document has syntax errors. Formatting may produce unexpected results. Format anyway?', 'Format anyway', 'Cancel');
			if (pick !== 'Format anyway') return;
		}

		const fullText = doc.getText();
		const formatted = await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: 'Formatting Python...',
			cancellable: false
		}, async (_progress) => {
			try {
				const out = await formatter.formatWithSystemFormatter(fullText);
				return out;
			} catch (e) {
				vscode.window.showWarningMessage('Formatting failed — leaving document unchanged');
				return fullText;
			}
		});

		if (formatted === fullText) {
			vscode.window.setStatusBarMessage('Python Formatter: already formatted', 2000);
			return;
		}

		const edit = new vscode.WorkspaceEdit();
		const fullRange = new vscode.Range(doc.positionAt(0), doc.positionAt(fullText.length));
		edit.replace(doc.uri, fullRange, formatted);
		await vscode.workspace.applyEdit(edit);
		await doc.save();
		vscode.window.setStatusBarMessage('Python Formatter: formatted', 2000);
	});

	context.subscriptions.push(disposable);
}

export function deactivate() {}
