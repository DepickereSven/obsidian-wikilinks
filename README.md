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

That's it — no configuration needed in the common case. The plugin reads
Obsidian's own vault registry and uses your active vault automatically.

Vault path resolution order:
1. `~/.claude/obsidian-wikilinks.json` → `{"vault": "..."}` (explicit override)
2. `$OBSIDIAN_VAULT` environment variable
3. Obsidian's vault registry — auto-detected (prefers the open vault, else most
   recently opened). Cross-platform (macOS / Windows / Linux).
4. `~/Documents/Obsidian` (default fallback)

You only need step 1 if you have **multiple vaults** and want to pin a specific
one. Create `~/.claude/obsidian-wikilinks.json`:

```json
{ "vault": "/Users/you/Documents/Obsidian" }
```

The plugin itself is identical on every device. Update with
`claude plugin update obsidian-wikilinks`.

## Requirements

- `python3` on PATH (standard-library only; no pip installs).
