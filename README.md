# python-formatter

`python-formatter` is a Visual Studio Code extension that formats Python files using **Black**, the industry-standard PEP8 formatter.

**Key features**

- **Auto-installs Black** — The extension automatically installs Black on first use if not already present.
- **Uses the most accurate formatter** — Black is the de facto standard Python formatter (used by Python, Django, PyTorch, etc.).
- **Zero configuration** — Works out of the box with sensible defaults.
- **Fast formatting** — Formats files in milliseconds.
- **Fallback built-in formatter** — Basic PEP8 formatting if Black is unavailable.

## Usage

1. Open a Python file in VS Code.
2. Press **Shift+Alt+F** (or run `Format Python (PEP8)` from the Command Palette).

The extension will:
1. Check if Black is installed (auto-installs on first use if needed)
2. Format the document with Black
3. Save the file

You can also use the standard VS Code **Format Document** command (Shift+Alt+F) — the extension registers as the default Python formatter.

## Keybinding

- `Shift+Alt+F` — Format current Python file (standard VS Code format keybinding)

## Requirements

- Python 3.6+ with pip (for Black auto-installation)
- Black will be automatically installed on first use if not already available

### Manual Black Installation (Optional)

If you prefer to install Black yourself:

```bash
pip install black
```

## Extension Settings

This extension does not add any user-configurable settings. It uses Black with sensible defaults.

## Known Issues

- The built-in fallback formatter (used when Black is unavailable) implements basic PEP8 rules and may not handle complex nested structures correctly. For best results, ensure Black is installed.

## Release Notes

See `CHANGELOG.md` for full release notes.

---

## Contributing

If you'd like to improve the formatter, open an issue or submit a pull request.

## License

This project is licensed under the MIT License — see the `LICENSE` file for details.

