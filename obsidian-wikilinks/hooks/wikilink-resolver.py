#!/usr/bin/env python3
"""UserPromptSubmit hook: resolve [[wikilinks]] in the prompt to Obsidian vault files.

Reads the hook JSON on stdin, scans the prompt for [[...]] references,
fuzzy-matches them against note names in the vault, and emits the resolved
absolute paths as additionalContext so Claude can read the right files.

Vault path resolution order:
  1. ~/.claude/obsidian-wikilinks.json  {"vault": "/path/to/vault"}
  2. $OBSIDIAN_VAULT environment variable
  3. Obsidian's own vault registry (auto-detected, cross-platform)
  4. ~/Documents/Obsidian (default)
"""
import difflib
import json
import os
import re
import sys

CONFIG_FILE = os.path.expanduser("~/.claude/obsidian-wikilinks.json")
SKIP_DIRS = {".obsidian", ".trash", ".git", ".vault-meta"}
WIKILINK = re.compile(r"\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]")


def obsidian_registry_paths():
    """Candidate locations of Obsidian's obsidian.json across platforms."""
    home = os.path.expanduser("~")
    candidates = [
        os.path.join(home, "Library", "Application Support", "obsidian", "obsidian.json"),  # macOS
        os.path.join(os.environ.get("APPDATA", ""), "obsidian", "obsidian.json"),            # Windows
        os.path.join(home, ".config", "obsidian", "obsidian.json"),                          # Linux
    ]
    return [p for p in candidates if p and os.path.isfile(p)]


def autodetect_vault():
    """Read Obsidian's vault registry; prefer the open vault, else most recent."""
    for path in obsidian_registry_paths():
        try:
            with open(path) as f:
                vaults = json.load(f).get("vaults", {})
        except (json.JSONDecodeError, OSError):
            continue
        valid = [v for v in vaults.values() if os.path.isdir(v.get("path", ""))]
        if not valid:
            continue
        valid.sort(key=lambda v: (bool(v.get("open")), v.get("ts", 0)), reverse=True)
        return valid[0]["path"]
    return None


def get_vault():
    if os.path.isfile(CONFIG_FILE):
        try:
            with open(CONFIG_FILE) as f:
                cfg = json.load(f)
            vault = cfg.get("vault", "")
            if vault:
                return os.path.expanduser(vault)
        except (json.JSONDecodeError, OSError):
            pass
    env = os.environ.get("OBSIDIAN_VAULT", "")
    if env:
        return os.path.expanduser(env)
    detected = autodetect_vault()
    if detected:
        return detected
    return os.path.expanduser("~/Documents/Obsidian")


def build_index(vault):
    index = []  # (stem, relpath, abspath)
    for root, dirs, files in os.walk(vault):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS and not d.startswith(".")]
        for d in dirs:
            abspath = os.path.join(root, d)
            relpath = os.path.relpath(abspath, vault)
            index.append((d, relpath, abspath + os.sep))
        for f in files:
            if f.startswith("."):
                continue
            abspath = os.path.join(root, f)
            relpath = os.path.relpath(abspath, vault)
            stem = os.path.splitext(f)[0]
            index.append((stem, relpath, abspath))
    return index


def normalize(s):
    return re.sub(r"[^a-z0-9]", "", s.lower())


def resolve(target, index):
    t = target.strip()
    t_lower = t.lower()
    t_md = t_lower if t_lower.endswith(".md") else t_lower + ".md"
    t_norm = normalize(t)

    # 1. exact stem match (case-insensitive)
    hits = [e for e in index if e[0].lower() == t_lower]
    # 2. exact relative path match (with or without .md)
    if not hits:
        hits = [e for e in index if e[1].lower() in (t_lower, t_md)]
    # 3. substring match on stem
    if not hits:
        hits = [e for e in index if t_lower in e[0].lower()]
    # 4. normalized containment ("Backend search" ~ "Back-end search vs ...")
    if not hits and t_norm:
        hits = [e for e in index if t_norm in normalize(e[0])]
    # 5. fuzzy match: full stems, then stem prefixes of target length
    if not hits:
        stems = {e[0]: e for e in index}
        close = difflib.get_close_matches(t, stems.keys(), n=3, cutoff=0.6)
        if not close:
            prefixes = {}
            for stem in stems:
                prefixes.setdefault(stem[: len(t)], stem)
            close = [prefixes[p] for p in
                     difflib.get_close_matches(t, prefixes.keys(), n=3, cutoff=0.6)]
        hits = [stems[c] for c in close]
    return hits[:3]


def main():
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        sys.exit(0)

    prompt = payload.get("prompt", "")
    targets = WIKILINK.findall(prompt)
    if not targets:
        sys.exit(0)

    vault = get_vault()
    if not os.path.isdir(vault):
        sys.exit(0)

    index = build_index(vault)
    lines = []
    for target in dict.fromkeys(targets):  # dedupe, keep order
        hits = resolve(target, index)
        if not hits:
            lines.append(f"[[{target}]] -> no match found in vault {vault}")
        elif len(hits) == 1:
            lines.append(f"[[{target}]] -> {hits[0][2]}")
        else:
            opts = ", ".join(h[2] for h in hits)
            lines.append(f"[[{target}]] -> ambiguous, candidates: {opts}")

    context = (
        "Obsidian wikilink resolution (vault: " + vault + "):\n"
        + "\n".join(lines)
        + "\nRead the resolved file(s) when their content is relevant to the request."
    )
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "UserPromptSubmit",
            "additionalContext": context,
        }
    }))
    sys.exit(0)


if __name__ == "__main__":
    main()
