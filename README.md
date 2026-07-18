# obsidian-wikilinks

Resolve `[[wikilinks]]` typed in a Codex or Claude Code prompt to absolute paths
in your Obsidian vault, and inject them as context so the agent reads the right
notes.

This is a **Codex and Claude Code** plugin (it teaches the coding agent about
`[[ ]]`), not an Obsidian-app plugin.

## How it works

A `UserPromptSubmit` hook scans each prompt for `[[...]]`, fuzzy-matches each
target against note and folder names in your vault, and emits the resolved
absolute paths as additional context. The agent can then read the referenced
notes when they are relevant to your request.

## Install in Codex

```bash
codex plugin marketplace add DepickereSven/obsidian-wikilinks
codex plugin add obsidian-wikilinks@depickeresven-obsidian-wikilinks
```

Start a new thread, run `/hooks`, and review and trust the plugin's
`UserPromptSubmit` hook when Codex asks. Installed command hooks do not run until
they have been trusted.

## Install in Claude Code

```bash
claude plugin marketplace add DepickereSven/obsidian-wikilinks
claude plugin install obsidian-wikilinks@depickeresven-obsidian-wikilinks
```

In the common case, no configuration is needed. The plugin reads Obsidian's own
vault registry and uses your active vault automatically.

## Examples

If your vault contains `Projects/Website Redesign.md`, this prompt:

```text
Summarize [[Website Redesign]] and list the next actions.
```

injects the note's absolute path so the agent can read and summarize it.

You can reference several notes, headings, and aliases in one prompt:

```text
Compare [[Research/AI Agents#Open questions]] with
[[Projects/Website Redesign|the project brief]].
```

The heading and alias are ignored during path lookup. Both note paths are added
to the prompt context. Folder wikilinks work too:

```text
Review the notes in [[Meetings]] and prepare a weekly summary.
```

When a name is ambiguous, the plugin provides up to three candidate paths. If
there is no match, it says so instead of guessing.

## Vault selection

Vault path resolution order:

1. The current host's explicit override:
   - Codex: `~/.codex/obsidian-wikilinks.json`
   - Claude Code: `~/.claude/obsidian-wikilinks.json`
2. The other host's config file, as a compatibility fallback
3. `$OBSIDIAN_VAULT` environment variable
4. Obsidian's vault registry — auto-detected (prefers the open vault, else most
   recently opened). Cross-platform (macOS / Windows / Linux).
5. `~/Documents/Obsidian` (default fallback)

You only need an explicit override if you have **multiple vaults** and want to
pin a specific one. Create the config file for your host with:

```json
{ "vault": "/Users/you/Documents/Obsidian" }
```

The plugin itself is identical on every device. Update Claude Code with
`claude plugin update obsidian-wikilinks`. Re-run the Codex `plugin add` command
to install an updated version there.

## Requirements

- `python3` on PATH (standard-library only; no pip installs).
