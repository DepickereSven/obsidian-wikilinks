#!/usr/bin/env node
/**
 * Keep the host manifest versions in sync with package.json.
 *
 * `node scripts/sync-versions.mjs`         writes package.json's version into
 *                                          the Claude Code and Codex manifests
 * `node scripts/sync-versions.mjs --check`  exits 1 if they are out of sync
 *
 * Run automatically by the npm `version` lifecycle script, so `npm version
 * <patch|minor|major>` bumps all three files in one commit.
 */
import {readFileSync, writeFileSync} from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const MANIFESTS = [".claude-plugin/plugin.json", ".codex-plugin/plugin.json"]
const check = process.argv.includes("--check")

const readJSON = (rel) => JSON.parse(readFileSync(path.join(root, rel), "utf8"))
const version = readJSON("package.json").version

let failed = false
for (const rel of MANIFESTS) {
    const manifest = readJSON(rel)
    if (manifest.version === version) {
        console.log(`ok      ${rel} ${manifest.version}`)
        continue
    }
    if (check) {
        console.error(`MISMATCH ${rel} is ${manifest.version}, package.json is ${version}`)
        failed = true
        continue
    }
    manifest.version = version
    writeFileSync(path.join(root, rel), JSON.stringify(manifest, null, 2) + "\n")
    console.log(`updated ${rel} -> ${version}`)
}

if (failed) {
    console.error("\nRun `node scripts/sync-versions.mjs` to fix.")
    process.exit(1)
}
