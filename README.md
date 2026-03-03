# python-formatter

`python-formatter` is a lightweight Visual Studio Code extension that formats Python files using an in-house, PEP8-inspired formatter.

**Key features**

- Format the active Python file according to common PEP8 conventions (indentation normalization, trailing whitespace removal, blank-line rules, basic operator spacing, and comment wrapping).
- Works entirely in-house (no external formatters needed).
- Trigger via the `Format Python (PEP8)` command or the keyboard shortcut.

## Usage

1. Open a Python file in VS Code.
2. Run the command `Format Python (PEP8)` from the Command Palette, or press the keybinding `Ctrl+Alt+F` when the editor is focused.

The formatter will replace the document contents with the formatted version and save the file.

## Keybinding

- `Ctrl+Alt+F` — Format current Python file (when the editor is focused and language is Python)

## Requirements

No external tools are required.

## Extension Settings

This extension does not add any user-configurable settings yet.

## Known Issues

- This formatter implements a conservative, heuristic-based subset of PEP8 rules. It may not cover all edge cases or complex code constructs. Use with caution on large or production-critical codebases.

## Release Notes

See `CHANGELOG.md` for full release notes.

---

## Contributing

If you'd like to improve the formatter, open an issue or submit a pull request.

## License

This project is licensed under the MIT License — see the `LICENSE` file for details.

