# obsidian-wikilinks (Claude Code plugin)

Resolve `[[wikilinks]]` typed in your Claude Code prompt to absolute paths in
your Obsidian vault, and inject them as context so Claude reads the right notes.

This is a **Claude Code** plugin (it teaches Claude about `[[ ]]`), not an
Obsidian-app plugin.

## How it works

A `UserPromptSubmit` hook scans each prompt for `[[...]]`, fuzzy-matches the
target against note/folder names in your vault, and emits the resolved absolute
path(s) as `additionalContext`.

## Install (per device)

```bash
claude plugin marketplace add DepickereSven/obsidian-wikilinks
claude plugin install obsidian-wikilinks@depickeresven-obsidian-wikilinks
```

Then tell this device where its vault lives — create
`~/.claude/obsidian-wikilinks.json`:

```json
{ "vault": "/Users/you/Documents/Obsidian" }
```

Vault path resolution order:
1. `~/.claude/obsidian-wikilinks.json` → `{"vault": "..."}`
2. `$OBSIDIAN_VAULT` environment variable
3. `~/Documents/Obsidian` (default)

The plugin itself is identical on every device; only the per-device config file
changes. Update with `claude plugin update obsidian-wikilinks`.

## Requirements

- `python3` on PATH (standard-library only; no pip installs).
