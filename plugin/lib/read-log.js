/**
 * Per-session log of the notes a prompt linked and the vault files the agent
 * read, shared by the OpenCode server plugin (writer) and sidebar (reader).
 *
 * One NDJSON file per session, because the TUI and the server run the plugin
 * in separate module instances and a file is the one thing both can see.
 *
 * Events:
 *   {kind: "link", ts, vault, target, status: "resolved"|"ambiguous"|"missing", paths}
 *   {kind: "read", ts, path}
 *
 * Only Node built-ins, so the server side stays install-free.
 */
import {appendFileSync, mkdirSync, readFileSync} from "node:fs"
import {homedir} from "node:os"
import path from "node:path"

export function stateDir() {
    const explicit = process.env.OBSIDIAN_WIKILINKS_STATE_DIR
    if (explicit) {
        return explicit
    }
    const base = process.env.XDG_STATE_HOME || path.join(homedir(), ".local", "state")
    return path.join(base, "obsidian-wikilinks", "sessions")
}

export function logPath(sessionID) {
    return path.join(stateDir(), `${String(sessionID).replace(/[^\w.-]/g, "_")}.ndjson`)
}

/** Append one event. Never throws: a broken log must not disturb the session. */
export function append(sessionID, event) {
    try {
        mkdirSync(stateDir(), {recursive: true})
        appendFileSync(logPath(sessionID), JSON.stringify(event) + "\n")
    } catch {
        // ignore
    }
}

export function parse(text) {
    const events = []
    for (const line of text.split("\n")) {
        if (!line.trim()) continue
        try {
            const event = JSON.parse(line)
            if (event && (event.kind === "link" || event.kind === "read")) {
                events.push(event)
            }
        } catch {
            // skip a torn or foreign line
        }
    }
    return events
}

export function readEvents(sessionID) {
    try {
        return parse(readFileSync(logPath(sessionID), "utf8"))
    } catch {
        return []
    }
}

/** Folder links end in a separator and cover every file below them. */
export function covers(linked, read) {
    if (linked.endsWith(path.sep) || linked.endsWith("/")) {
        return read.startsWith(linked)
    }
    return read === linked
}

export function insideVault(vault, file) {
    const rel = path.relative(vault, file)
    return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel)
}

/**
 * Fold a session's events into what the sidebar shows: every linked note with
 * the reads that satisfy it, plus vault files read without being linked.
 */
export function buildView(events) {
    const links = new Map()
    const vaults = new Set()
    const reads = []
    for (const event of events) {
        if (event.kind === "link") {
            vaults.add(event.vault)
            const paths = Array.isArray(event.paths) ? event.paths : []
            const existing = links.get(event.target)
            // Re-linking a note keeps its first position but takes the latest resolution.
            links.set(event.target, {target: event.target, status: event.status, paths, vault: event.vault, ts: existing?.ts ?? event.ts})
        } else if (typeof event.path === "string" && !reads.includes(event.path)) {
            reads.push(event.path)
        }
    }

    const claimed = new Set()
    const items = [...links.values()].map((link) => {
        const read = reads.filter((file) => link.paths.some((linked) => covers(linked, file)))
        read.forEach((file) => claimed.add(file))
        const state = link.status === "missing" ? "missing" : read.length ? "read" : "unread"
        return {...link, read, state}
    })
    const other = reads.filter((file) => !claimed.has(file) && [...vaults].some((vault) => insideVault(vault, file)))
    return {links: items, other, vaults: [...vaults]}
}

const ICON = {read: "✓", unread: "○", missing: "✗"}

function fit(text, width) {
    return text.length > width ? text.slice(0, Math.max(1, width - 1)) + "…" : text
}

function relative(vaults, file) {
    const vault = vaults.find((v) => insideVault(v, file))
    return vault ? path.relative(vault, file) : file
}

/**
 * Sidebar rows for a view. Empty when the session linked nothing, so the
 * section stays out of the way in sessions that never used a wikilink.
 * Each row: {text, tone: "title"|"read"|"unread"|"missing"|"muted", toggle?}
 */
export function sidebarLines(view, {open = true, width = 30} = {}) {
    if (!view.links.length) {
        return []
    }
    const readCount = view.links.filter((l) => l.state === "read").length
    const unreadCount = view.links.length - readCount
    const rows = [{text: fit(`${open ? "▼" : "▶"} Obsidian notes  ✓ ${readCount}  ○ ${unreadCount}`, width), tone: "title", toggle: true}]
    if (!open) {
        return rows
    }

    for (const link of view.links) {
        const label = link.paths.length === 1 && link.paths[0].endsWith(path.sep)
            ? `${link.target}/`
            : link.target
        let suffix = ""
        if (link.state === "missing") {
            suffix = " (no match)"
        }
        else if (link.paths.length > 1 || label.endsWith("/")) {
            suffix = link.read.length ? ` (${link.read.length} read)` : ""
        }
        if (link.status === "ambiguous" && !link.read.length) {
            suffix = ` (${link.paths.length} candidates)`
        }
        rows.push({text: fit(`  ${ICON[link.state]} ${label}${suffix}`, width), tone: link.state})
    }
    if (view.other.length) {
        rows.push({text: fit("  also read", width), tone: "muted"})
        for (const file of view.other) {
            rows.push({text: fit(`  · ${relative(view.vaults, file)}`, width), tone: "muted"})
        }
    }
    return rows
}
