import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {

	const selector: vscode.DocumentSelector = { language: 'python', scheme: 'file' };

	const provider: vscode.DocumentFormattingEditProvider = {
		provideDocumentFormattingEdits(document: vscode.TextDocument): vscode.TextEdit[] {
			const fullText = document.getText();
			const formatted = formatPython(fullText);
			const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(fullText.length));
			return [vscode.TextEdit.replace(fullRange, formatted)];
		}
	};

	context.subscriptions.push(vscode.languages.registerDocumentFormattingEditProvider(selector, provider));

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
		const fullText = doc.getText();
		const formatted = formatPython(fullText);

		if (formatted === fullText) {
			vscode.window.setStatusBarMessage('Python Formatter: already formatted', 2000);
			return;
		}

		const edit = new vscode.WorkspaceEdit();
		const fullRange = new vscode.Range(doc.positionAt(0), doc.positionAt(fullText.length));
		edit.replace(doc.uri, fullRange, formatted);
		await vscode.workspace.applyEdit(edit);
		await doc.save();
		vscode.window.setStatusBarMessage('Python Formatter: formatted (PEP8-ish)', 2000);
	});

	context.subscriptions.push(disposable);
}

export function deactivate() {}

// Formatter implementation (in-house, simple PEP8-ish rules)
function formatPython(text: string): string {
	if (!text) return '\n';

	// Normalize line endings to \n
	text = text.replace(/\r\n?/g, '\n');

	// Split semicolon-joined one-liners into separate lines when safe
	text = splitSemicolons(text);

	// Infer indentation for left-flushed code and normalize tabs
	const indented = inferIndentation(text);

	// Collapse 3+ blank lines into two (PEP8: at most 2 top-level)
	let result = indented.replace(/\n{3,}/g, '\n\n');

	// Ensure two blank lines before top-level class/def (line-based, avoids inserting between decorators and defs)
	result = ensureTopLevelSpacing(result);

	// Wrap long comment lines at ~79 characters
	const MAX = 79;
	const pieces = result.split('\n');
	const wrapped: string[] = [];
	for (const line of pieces) {
		const m = line.match(/^(\s*)(#\s?)(.*)$/);
		if (m) {
			const indent = m[1] || '';
			const prefix = m[2] || '# ';
			const body = m[3] || '';
			const words = body.split(/\s+/);
			let cur = indent + prefix;
			for (const w of words) {
				if ((cur + w).length > MAX) {
					wrapped.push(cur.trimRight());
					cur = indent + prefix + w + ' ';
				} else {
					cur += w + ' ';
				}
			}
			wrapped.push(cur.trimRight());
		} else {
			wrapped.push(line);
		}
	}

	result = wrapped.join('\n');

	// Basic spacing around common operators (naive, avoids strings/comments by simple scan)
	result = normalizeOperatorSpacing(result);

	// Ensure single trailing newline
	result = result.replace(/\s*$/g, '') + '\n';

	// Dedent common top-level main guard blocks that were accidentally indented
	result = dedentMainBlock(result);

	return result;
}

function dedentMainBlock(text: string): string {
	const lines = text.split('\n');
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const m = line.match(/^(\s*)if\s+__name__\s*==/i);
		if (m) {
			const origIndent = m[1].length;
			if (origIndent === 0) return lines.join('\n');
			// dedent the if-line
			lines[i] = lines[i].trimLeft();
			// adjust following block lines that are indented relative to original indent
			let j = i + 1;
			while (j < lines.length) {
				const ln = lines[j];
				if (ln.trim() === '') { j++; continue; }
				const leadingMatch = ln.match(/^(\s*)/);
				const leading = leadingMatch ? leadingMatch[1].length : 0;
				if (leading > origIndent) {
					const newLeading = Math.max(0, leading - origIndent);
					lines[j] = ' '.repeat(newLeading) + ln.slice(leading);
					j++;
				} else break;
			}
			break;
		}
	}
	return lines.join('\n');
}

// Split semicolons into newlines when they are not inside strings, brackets, or comments
function splitSemicolons(text: string): string {
	let out = '';
	let i = 0;
	const n = text.length;
	let inSingle = false;
	let inDouble = false;
	let inTripleSingle = false;
	let inTripleDouble = false;
	let parenDepth = 0;
	let inComment = false;

	while (i < n) {
		// handle newline resets for comments
		const ch = text[i];
		const next2 = text.substr(i, 3);

		if (inComment) {
			out += ch;
			if (ch === '\n') inComment = false;
			i++;
			continue;
		}

		// triple quote handling
		if (!inSingle && !inDouble && next2 === "'''") {
			inTripleSingle = !inTripleSingle;
			out += "'''";
			i += 3;
			continue;
		}
		if (!inSingle && !inDouble && next2 === '"""') {
			inTripleDouble = !inTripleDouble;
			out += '"""';
			i += 3;
			continue;
		}

		if (inTripleSingle || inTripleDouble) {
			out += ch;
			i++;
			continue;
		}

		if (ch === "'" && !inDouble) {
			inSingle = !inSingle;
			out += ch;
			i++;
			continue;
		}
		if (ch === '"' && !inSingle) {
			inDouble = !inDouble;
			out += ch;
			i++;
			continue;
		}

		if (!inSingle && !inDouble) {
			if (ch === '#') {
				inComment = true;
				out += ch;
				i++;
				continue;
			}
			if (ch === '(' || ch === '[' || ch === '{') parenDepth++;
			else if (ch === ')' || ch === ']' || ch === '}') parenDepth = Math.max(0, parenDepth - 1);

			if (ch === ';' && parenDepth === 0) {
				// replace semicolon and any following spaces with a newline
				out = out.replace(/[ \t]+$/g, '');
				out += '\n';
				i++;
				while (i < n && /[ \t]/.test(text[i])) i++;
				continue;
			}
		}

		out += ch;
		i++;
	}

	return out;
}

// Infer indentation for left-flushed code using simple heuristics
function inferIndentation(text: string): string {
	const rawLines = text.split('\n');
	const out: string[] = [];
	let indent = 0;
	let prevEndedWithColon = false;

	for (let i = 0; i < rawLines.length; i++) {
		let line = rawLines[i];

		// Normalize tabs
		line = line.replace(/^\t+/g, (m) => ' '.repeat(4 * m.length));

		// Trim right
		line = line.replace(/[ \t]+$/g, '');

		const stripped = line.trim();

		// If this is a decorator line and the next non-empty line is a top-level def/class,
		// and we currently inferred a positive indent for flushed-left code, reset to 0.
		if (stripped.startsWith('@')) {
			// look ahead through any number of decorator lines to find the following def/class
			let j = i + 1;
			let nextStr = '';
			while (j < rawLines.length) {
				nextStr = rawLines[j].trim();
				if (nextStr === '') { j++; continue; }
				if (nextStr.startsWith('@')) { j++; continue; }
				break;
			}
			if (nextStr && (/^def\b/.test(nextStr) || /^class\b/.test(nextStr)) && indent > 0 && !prevEndedWithColon) {
				indent = 0;
			}
		}

		// If this is a comment line that precedes a decorator which then precedes
		// a top-level def/class (common pattern), dedent the comment and decorator.
		if (stripped.startsWith('#')) {
			let j = i + 1;
			let nextStr = '';
			while (j < rawLines.length) {
				nextStr = rawLines[j].trim();
				if (nextStr !== '') break;
				j++;
			}
			if (nextStr && nextStr.startsWith('@')) {
				// look ahead through decorators to find the following def/class
				let k = j + 1;
				let nextNext = '';
				while (k < rawLines.length) {
					nextNext = rawLines[k].trim();
					if (nextNext === '') { k++; continue; }
					if (nextNext.startsWith('@')) { k++; continue; }
					break;
				}
				if (nextNext && (/^def\b/.test(nextNext) || /^class\b/.test(nextNext)) && indent > 0 && !prevEndedWithColon) {
					indent = 0;
				}
			}
		}

		if (stripped === '') {
			out.push('');
			// blank lines do not change indentation but reset prevEndedWithColon
			prevEndedWithColon = false;
			continue;
		}

		const lowered = stripped.toLowerCase();

		// dedent before lines that start block-closing keywords
		if (/^(elif\b|else\b|except\b|finally\b)/.test(lowered)) {
			indent = Math.max(0, indent - 1);
		}

		// If we see a top-level def/class and we're indented but previous line didn't open a block,
		// assume this is actually top-level and reset indent to 0 (heuristic for flushed-left code)
		if ((/^def\b/.test(stripped) || /^class\b/.test(stripped)) && indent > 0 && !prevEndedWithColon) {
			indent = 0;
		}

		// If a top-level "if __name__ == '__main__'" appears (possibly with extra spaces),
		// treat it as top-level and reset indent so it stays left-aligned.
		if (/^if\s+__name__\s*==/i.test(stripped) && indent > 0 && !prevEndedWithColon) {
			indent = 0;
		}

		const indentedLine = ' '.repeat(indent * 4) + stripped;
		out.push(indentedLine);

		// If this line opens a new block (ends with ':'), increase indent for following lines
		if (stripped.endsWith(':') && !stripped.startsWith('#')) {
			indent += 1;
			prevEndedWithColon = true;
		} else {
			prevEndedWithColon = false;
		}
	}

	return out.join('\n');
}

function ensureTopLevelSpacing(text: string): string {
	const lines = text.split('\n');
	for (let i = 0; i < lines.length; i++) {
		const cur = lines[i];
		const trimmed = cur.trim();
		if (trimmed === '') continue;
		// detect top-level class or def (no leading indent)
		if ((/^class\b/.test(trimmed) || /^def\b/.test(trimmed)) && cur.startsWith(trimmed)) {
			// find previous non-empty line
			let p = i - 1;
			while (p >= 0 && lines[p].trim() === '') p--;

			// if previous non-empty is a decorator, find the non-empty before the decorator
			let insertAt = p + 1;
			if (p >= 0 && lines[p].trim().startsWith('@')) {
				// find the start of a contiguous block of decorators and preceding comments
				let r = p;
				while (r - 1 >= 0) {
					const t = lines[r - 1].trim();
					if (t.startsWith('@') || t.startsWith('#')) r--; else break;
				}
				insertAt = r;
			}

			// Determine the previous content line index (the last non-empty, non-decorator/comment line before insertAt)
			let prevContent = insertAt - 1;
			while (prevContent >= 0 && lines[prevContent].trim() === '') prevContent--;
			// If the previous non-empty line is a decorator/comment, walk backwards to find actual content
			if (prevContent >= 0 && (lines[prevContent].trim().startsWith('@') || lines[prevContent].trim().startsWith('#'))) {
				let q = prevContent;
				while (q >= 0) {
					const t = lines[q].trim();
					if (t.startsWith('@') || t.startsWith('#')) q--; else break;
				}
				prevContent = q;
			}

			// do not insert at start of file
			if (prevContent < 0) continue;

			const blanksBetween = insertAt - prevContent - 1;
			// if the block starts with a comment, require only 1 blank line before it; otherwise require 2
			const startTrim = lines[insertAt] ? lines[insertAt].trim() : '';
			const required = startTrim.startsWith('#') ? 1 : 2;
			if (blanksBetween > required) {
				// remove extra blank lines, keep exactly `required`
				lines.splice(prevContent + 1 + required, blanksBetween - required);
				i = prevContent + 1 + required;
			} else if (blanksBetween < required) {
				const need = required - blanksBetween;
				for (let k = 0; k < need; k++) lines.splice(prevContent + 1, 0, '');
				i += need;
			}
		}
	}
	return lines.join('\n');
}

function normalizeOperatorSpacing(text: string): string {
	const operators = ['==', '!=', '<=', '>=', '<<', '>>', '=', '+', '-', '*', '/', '%', '<', '>', '|', '&', '^'];

	let out = '';
	let i = 0;
	const n = text.length;
	let inSingle = false;
	let inDouble = false;
	let inTriple = false;
	let inComment = false;
	let parenDepth = 0;

	while (i < n) {
		// detect triple quotes start/end
		if (!inSingle && !inDouble && text.startsWith("'''", i)) {
			inTriple = !inTriple;
			out += "'''";
			i += 3;
			continue;
		}
		if (!inSingle && !inDouble && text.startsWith('"""', i)) {
			inTriple = !inTriple;
			out += '"""';
			i += 3;
			continue;
		}
		const ch = text[i];

		if (inComment) {
			out += ch;
			if (ch === '\n') inComment = false;
			i++;
			continue;
		}
		if (!inTriple) {
			if (ch === "'" && !inDouble) inSingle = !inSingle;
			else if (ch === '"' && !inSingle) inDouble = !inDouble;
		} else {
			// inside triple, just copy until triple close handled above
		}

		if (!inSingle && !inDouble && !inTriple) {
			if (ch === '#') {
				inComment = true;
				out += ch;
				i++;
				continue;
			}
			if (ch === '(' || ch === '[' || ch === '{') parenDepth++;
			else if (ch === ')' || ch === ']' || ch === '}') parenDepth = Math.max(0, parenDepth - 1);
			// try to match operator at i
			let matched = null;
			for (const op of ['==', '!=', '<=', '>=', '<<', '>>', '=', '+', '-', '*', '/', '%', '<', '>', '|', '&', '^']) {
				if (text.startsWith(op, i)) {
					matched = op;
					break;
				}
			}
			if (matched) {
				// Do not add spaces around '=' when inside parentheses (keyword args / default values)
				if (matched === '=' && parenDepth > 0) {
					out += matched;
					i += matched.length;
					// skip any original spaces after operator to avoid duplication
					while (i < n && /[ \t]/.test(text[i])) i++;
					continue;
				}
				// ensure single space before and after for other operators
				while (out.endsWith(' ')) out = out.slice(0, -1);
				out += ' ' + matched + ' ';
				i += matched.length;
				// skip any original spaces after operator to avoid leaving multiple spaces
				while (i < n && /[ \t]/.test(text[i])) i++;
				continue;
			}
		}

		out += ch;
		i++;
	}

	return out;
}
