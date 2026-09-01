/**
 * OpenCode plugin: resolve [[wikilinks]] in a prompt to Obsidian vault paths.
 *
 * Thin wrapper around hooks/wikilink-resolver.py, the same resolver used by the
 * Claude Code and Codex UserPromptSubmit hooks. The Python script owns all
 * vault detection and matching logic; this file only bridges OpenCode's
 * `chat.message` hook to it.
 */
import {spawn} from "node:child_process"
import {existsSync} from "node:fs"
import {homedir} from "node:os"
import path from "node:path"
import {fileURLToPath} from "node:url"

const WIKILINK = /\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/
const PYTHON = process.env.OBSIDIAN_WIKILINKS_PYTHON || "python3"
const TIMEOUT_MS = Number(process.env.OBSIDIAN_WIKILINKS_TIMEOUT_MS || 10000)

/** Locate wikilink-resolver.py, whether the plugin is symlinked, copied, or installed by another host. */
function findResolver() {
    const explicit = process.env.OBSIDIAN_WIKILINKS_RESOLVER
    if (explicit) return existsSync(explicit) ? explicit : null

    const candidates = []
    const here = path.dirname(fileURLToPath(import.meta.url))
    // Repo layout: <root>/plugin/obsidian-wikilinks.js -> <root>/hooks/wikilink-resolver.py
    for (let dir = here, i = 0; i < 5; i++, dir = path.dirname(dir)) {
        candidates.push(path.join(dir, "hooks", "wikilink-resolver.py"))
        if (dir === path.dirname(dir)) break
    }
    // Copied next to the plugin file
    candidates.push(path.join(here, "wikilink-resolver.py"))
    // Installed by another host on the same machine
    const home = homedir()
    for (const base of [
        path.join(home, ".config", "opencode", "obsidian-wikilinks"),
        path.join(home, ".claude", "plugins", "obsidian-wikilinks"),
        path.join(home, ".codex", "plugins", "obsidian-wikilinks"),
    ]) {
        candidates.push(path.join(base, "hooks", "wikilink-resolver.py"))
    }
    return candidates.find(existsSync) || null
}

/** Run the resolver with the hook payload on stdin; resolve to its additionalContext, or null. */
function resolveWikilinks(script, prompt) {
    return new Promise((resolve) => {
        let child
        try {
            child = spawn(PYTHON, [script], {
                stdio: ["pipe", "pipe", "ignore"],
                env: {...process.env, OBSIDIAN_WIKILINKS_HOST: "opencode"},
            })
        } catch {
            return resolve(null)
        }

        let out = ""
        const done = (value) => {
            clearTimeout(timer)
            resolve(value)
        }
        const timer = setTimeout(() => {
            child.kill()
            done(null)
        }, TIMEOUT_MS)

        child.stdout.on("data", (chunk) => (out += chunk))
        child.on("error", () => done(null))
        child.on("close", () => {
            try {
                const context = JSON.parse(out).hookSpecificOutput?.additionalContext
                done(typeof context === "string" && context ? context : null)
            } catch {
                done(null)
            }
        })

        child.stdin.on("error", () => {
        })
        child.stdin.end(JSON.stringify({prompt}))
    })
}

let partCounter = 0

function partID() {
    partCounter += 1
    const stamp = Date.now().toString(36)
    const rand = Math.random().toString(36).slice(2, 10)
    return `prt_wikilink_${stamp}${partCounter.toString(36)}${rand}`
}

/** @type {import("@opencode-ai/plugin").Plugin} */
export const ObsidianWikilinksPlugin = async () => {
    return {
        "chat.message": async (_input, output) => {
            const prompt = output.parts
                .filter((part) => part.type === "text" && !part.synthetic && part.text)
                .map((part) => part.text)
                .join("\n")
            if (!prompt || !WIKILINK.test(prompt)) return

            const script = findResolver()
            if (!script) return

            const context = await resolveWikilinks(script, prompt)
            if (!context) return

            output.parts.push({
                id: partID(),
                sessionID: output.message.sessionID,
                messageID: output.message.id,
                type: "text",
                text: context,
                synthetic: true,
            })
        },
    }
}

// Default export shape required by opencode for npm and file:// plugin specs
// (`{ id, server }`); the named export above keeps plugin-directory loading
// working on older opencode versions that scan named exports.
export default {
    id: "obsidian-wikilinks",
    server: ObsidianWikilinksPlugin,
}
