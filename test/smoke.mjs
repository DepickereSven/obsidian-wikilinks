#!/usr/bin/env node
/**
 * Smoke tests for the OpenCode plugin and the shared Python resolver.
 *
 * Plain script rather than a test framework so the exact same file runs under
 * both Node and Bun — OpenCode runs plugins on Bun, so both matter.
 */
import assert from "node:assert/strict"
import {execFileSync} from "node:child_process"
import {mkdtempSync, mkdirSync, writeFileSync, existsSync} from "node:fs"
import {tmpdir} from "node:os"
import path from "node:path"
import {fileURLToPath} from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const PLUGIN = path.join(root, "plugin", "obsidian-wikilinks.js")
const RESOLVER = path.join(root, "hooks", "wikilink-resolver.py")

let failures = 0

async function test(name, fn) {
    try {
        await fn()
        console.log(`  ok   ${name}`)
    } catch (error) {
        failures += 1
        console.error(`  FAIL ${name}\n       ${error.message}`)
    }
}

// A throwaway vault so the tests never touch the developer's real notes.
const vault = mkdtempSync(path.join(tmpdir(), "wikilink-vault-"))
mkdirSync(path.join(vault, "Projects"))
mkdirSync(path.join(vault, "Meetings"))
writeFileSync(path.join(vault, "Projects", "Website Redesign.md"), "# Website Redesign\n")
writeFileSync(path.join(vault, "Meetings", "Weekly.md"), "# Weekly\n")
process.env.OBSIDIAN_VAULT = vault

const mod = await import(PLUGIN)

/** Run the chat.message hook over a single user text part. */
async function chat(text, plugin = mod.default.server) {
    const hooks = await plugin({})
    const output = {
        message: {id: "msg_test", sessionID: "ses_test"},
        parts: [{id: "prt_test", type: "text", messageID: "msg_test", sessionID: "ses_test", text}],
    }
    await hooks["chat.message"]({sessionID: "ses_test"}, output)
    return output
}

console.log(`plugin module (${typeof Bun === "undefined" ? "node" : "bun"})`)

await test("exports the PluginModule shape opencode requires", () => {
    assert.equal(typeof mod.default, "object")
    assert.equal(typeof mod.default.server, "function")
    assert.equal(mod.default.id, "obsidian-wikilinks")
})

await test("keeps the named export for plugin-directory loading", () => {
    assert.equal(typeof mod.ObsidianWikilinksPlugin, "function")
})

await test("registers the chat.message hook", async () => {
    const hooks = await mod.default.server({})
    assert.equal(typeof hooks["chat.message"], "function")
})

console.log("wikilink resolution")

await test("appends a synthetic part resolving a note", async () => {
    const {parts} = await chat("Summarize [[Website Redesign]]")
    assert.equal(parts.length, 2)
    const added = parts[1]
    assert.equal(added.type, "text")
    assert.equal(added.synthetic, true)
    assert.equal(added.sessionID, "ses_test")
    assert.equal(added.messageID, "msg_test")
    assert.ok(added.id.startsWith("prt_"), `unexpected part id ${added.id}`)
    assert.ok(added.text.includes(path.join(vault, "Projects", "Website Redesign.md")))
})

await test("resolves folder wikilinks", async () => {
    const {parts} = await chat("Review [[Meetings]]")
    assert.ok(parts[1].text.includes(path.join(vault, "Meetings") + path.sep))
})

await test("resolves several wikilinks in one prompt", async () => {
    const {parts} = await chat("Compare [[Website Redesign|brief]] with [[Weekly#Agenda]]")
    assert.ok(parts[1].text.includes("Website Redesign.md"))
    assert.ok(parts[1].text.includes("Weekly.md"))
})

await test("reports unmatched wikilinks instead of guessing", async () => {
    const {parts} = await chat("Read [[Definitely Not A Note Zzz]]")
    assert.ok(parts[1].text.includes("no match found"))
})

await test("does nothing when the prompt has no wikilinks", async () => {
    const {parts} = await chat("just a normal question")
    assert.equal(parts.length, 1)
})

await test("works through the named export too", async () => {
    const {parts} = await chat("Summarize [[Website Redesign]]", mod.ObsidianWikilinksPlugin)
    assert.equal(parts.length, 2)
})

console.log("python resolver")

await test("resolver script ships next to the plugin", () => {
    assert.ok(existsSync(RESOLVER), `missing ${RESOLVER}`)
})

await test("emits the hook JSON contract the other hosts consume", () => {
    const out = execFileSync("python3", [RESOLVER], {
        input: JSON.stringify({prompt: "Summarize [[Website Redesign]]"}),
        env: {...process.env, OBSIDIAN_WIKILINKS_HOST: "opencode"},
        encoding: "utf8",
    })
    const payload = JSON.parse(out)
    assert.equal(payload.hookSpecificOutput.hookEventName, "UserPromptSubmit")
    assert.ok(payload.hookSpecificOutput.additionalContext.includes("Website Redesign.md"))
})

await test("stays silent when there is nothing to resolve", () => {
    const out = execFileSync("python3", [RESOLVER], {
        input: JSON.stringify({prompt: "no links here"}),
        encoding: "utf8",
    })
    assert.equal(out.trim(), "")
})

await test("prefers an explicit host config over $OBSIDIAN_VAULT", () => {
    const configDir = mkdtempSync(path.join(tmpdir(), "wikilink-cfg-"))
    const other = mkdtempSync(path.join(tmpdir(), "wikilink-vault2-"))
    writeFileSync(path.join(other, "Alpha.md"), "# Alpha\n")
    writeFileSync(
        path.join(configDir, "obsidian-wikilinks.json"),
        JSON.stringify({vault: other}),
    )
    const out = execFileSync("python3", [RESOLVER], {
        input: JSON.stringify({prompt: "read [[Alpha]]"}),
        env: {...process.env, OPENCODE: "1", OPENCODE_CONFIG_DIR: configDir},
        encoding: "utf8",
    })
    assert.ok(JSON.parse(out).hookSpecificOutput.additionalContext.includes(path.join(other, "Alpha.md")))
})

console.log(failures ? `\n${failures} test(s) failed` : "\nall tests passed")
process.exit(failures ? 1 : 0)
