import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as util from 'util';
import * as path from 'path';
import * as os from 'os';

let blackInstalled = false;
let blackPath: string | null = null;

/**
 * Format Python code using Black (auto-installs if needed).
 * Black is the most accurate formatter and the only one we use.
 */
export async function formatWithSystemFormatter(code: string): Promise<string> {
    // Check if Black is already available or installed
    if (!blackInstalled || !blackPath) {
        blackPath = await findOrInstallBlack();
        if (blackPath) {
            blackInstalled = true;
        }
    }

    if (blackPath) {
        try {
            const result = await formatWithBlack(blackPath, code);
            vscode.window.setStatusBarMessage('Formatted with Black', 2000);
            return result;
        } catch (e) {
            console.error('Black formatting failed:', e);
        }
    }

    // Fallback to built-in (rarely reached)
    vscode.window.showWarningMessage('Black not available. Using built-in formatter (basic).');
    return formatBuiltIn(code);
}

/**
 * Try to find Black, or install it automatically.
 */
async function findOrInstallBlack(): Promise<string | null> {
    // 1. Check if black is in PATH
    const inPath = await checkCommandExists('black');
    if (inPath) {
        return 'black';
    }

    // 2. Try to install black via pip
    return await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Installing Black formatter...',
        cancellable: false
    }, async () => {
        try {
            // Try installing in user site-packages (no admin needed)
            await execPromise('pip install black --user');

            // Recheck if black is now available
            const nowAvailable = await checkCommandExists('black');
            if (nowAvailable) {
                vscode.window.showInformationMessage('Black installed successfully!');
                return 'black';
            }

            // Try with python -m black
            const pythonModuleWorks = await checkCommandExists('python -m black');
            if (pythonModuleWorks) {
                vscode.window.showInformationMessage('Black installed successfully!');
                return 'python -m black';
            }

            return null;
        } catch (e) {
            console.error('Failed to install Black:', e);
            return null;
        }
    });
}

async function formatWithBlack(blackCmd: string, code: string): Promise<string> {
    return vscode.window.withProgress({
        location: vscode.ProgressLocation.Window,
        title: 'Formatting with Black...'
    }, async () => {
        // Use --quiet for clean output, - for stdin
        const args = blackCmd === 'python -m black' ? ['-m', 'black', '--quiet', '-'] : ['--quiet', '-'];
        const cmd = blackCmd === 'python -m black' ? 'python' : blackCmd;

        return await runWithStdin(cmd, args, code);
    });
}

const execPromise = util.promisify(cp.exec);

async function checkCommandExists(cmd: string): Promise<boolean> {
    try {
        if (cmd === 'python -m black') {
            await execPromise('python -m black --version', { timeout: 5000 });
        } else {
            await execPromise(`${cmd} --version`, { timeout: 5000 });
        }
        return true;
    } catch {
        return false;
    }
}

function runWithStdin(command: string, args: string[], input: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const child = cp.spawn(command, args, { shell: true });
        let stdout = '';
        let stderr = '';

        const timeout = setTimeout(() => {
            child.kill();
            reject(new Error('Timeout'));
        }, 10000);

        child.stdout?.on('data', (data) => {
            stdout += data.toString();
        });

        child.stderr?.on('data', (data) => {
            stderr += data.toString();
        });

        child.on('close', (code) => {
            clearTimeout(timeout);
            if (code === 0) {
                resolve(stdout);
            } else {
                reject(new Error(stderr || `Exit code ${code}`));
            }
        });

        child.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
        });

        child.stdin?.write(input);
        child.stdin?.end();
    });
}

/**
 * Built-in simple formatter as fallback.
 * Handles basic PEP8: indentation, blank lines, whitespace
 */
function formatBuiltIn(code: string): string {
    const lines = code.split('\n');
    const result: string[] = [];
    const indentStack: number[] = [0];  // Stack to track indent levels
    
    // Keywords that start a new block (end with :)
    const blockStartKeywords = /^(if|elif|else|for|while|with|try|except|finally|def|class|async\s+def|async\s+with|async\s+for)\b/;
    // Keywords that end a block
    const blockEndKeywords = /^(return|raise|break|continue|pass)\b/;
    
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        
        // Remove trailing whitespace
        line = line.replace(/[ \t]+$/, '');
        
        // Skip empty lines at start of file
        if (result.length === 0 && line.trim() === '') {
            continue;
        }
        
        const stripped = line.trim();
        
        // Skip completely empty lines (preserve them in output)
        if (stripped.length === 0) {
            result.push('');
            continue;
        }
        
        // Calculate current indent level from stack
        let currentIndent = indentStack[indentStack.length - 1];
        
        // Check if this line starts a dedent (elif/else/except/finally)
        if (stripped.match(/^(elif|else|except|finally)\b/) && indentStack.length > 1) {
            // Pop one level for this dedent, then use that level
            indentStack.pop();
            currentIndent = indentStack[indentStack.length - 1];
        }
        
        // Apply indent
        const indent = '    '.repeat(currentIndent);
        line = indent + stripped;
        result.push(line);
        
        // Check if this line starts a new block
        const endsWithColon = stripped.endsWith(':');
        const isBlockStart = blockStartKeywords.test(stripped) && endsWithColon;
        
        if (isBlockStart) {
            // Push new indent level for the next line
            indentStack.push(currentIndent + 1);
        }
        // Check if this line ends a block
        else if (blockEndKeywords.test(stripped)) {
            // Pop the stack to go back to previous level
            if (indentStack.length > 1) {
                indentStack.pop();
            }
        }
    }
    
    // Ensure single blank line at end
    while (result.length > 0 && result[result.length - 1].trim() === '') {
        result.pop();
    }
    result.push('');
    
    return result.join('\n');
}
