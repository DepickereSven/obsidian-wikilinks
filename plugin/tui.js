/**
 * OpenCode TUI plugin: an "Obsidian notes" sidebar section listing every note
 * the session's prompts linked with [[wikilinks]], marked ✓ read or ○ not read.
 *
 * Reads the per-session log the server plugin writes (lib/read-log.js).
 * `@opentui/solid` and `solid-js` are provided by opencode at runtime.
 */
import {mkdirSync, statSync, watch} from "node:fs"

import {createElement, insert, setProp} from "@opentui/solid"
import {createSignal, onCleanup} from "solid-js"

import {buildView, logPath, readEvents, sidebarLines, stateDir} from "./lib/read-log.js"

/** Below opencode's own sidebar content. */
const ORDER = 810
const DEFAULT_WIDTH = 30

function element(tag, props, children = []) {
    const node = createElement(tag)
    for (const [key, value] of Object.entries(props)) {
        if (value !== undefined) {
            setProp(node, key, value)
        }
    }
    for (const child of children) {
        insert(node, child)
    }
    return node
}

function color(theme, tone) {
    if (tone === "title") {
        return theme.text
    }
    if (tone === "read") {
        return theme.success
    }
    if (tone === "unread") {
        return theme.warning
    }
    if (tone === "missing") {
        return theme.error
    }
    return theme.textMuted
}

function mtime(file) {
    try {
        return statSync(file).mtimeMs
    } catch {
        return 0
    }
}

/**
 * Call `onChange` when the session's log changes. Watches the directory, since
 * the file only appears with the first link; polling covers filesystems where
 * fs.watch is unreliable.
 */
function watchLog(sessionID, onChange) {
    const file = logPath(sessionID)
    let last = mtime(file)
    const check = () => {
        const current = mtime(file)
        if (current === last) {
            return
        }
        last = current
        onChange()
    }
    let watcher
    try {
        mkdirSync(stateDir(), {recursive: true})
        watcher = watch(stateDir(), check)
    } catch {
        watcher = undefined
    }
    const poll = setInterval(check, 2000)
    return () => {
        clearInterval(poll)
        watcher?.close()
    }
}

function Section(api, sessionID, width) {
    const [view, setView] = createSignal(buildView(readEvents(sessionID)))
    const [open, setOpen] = createSignal(true)
    const redraw = () => api.renderer.requestRender()

    onCleanup(
        watchLog(sessionID, () => {
            setView(buildView(readEvents(sessionID)))
            redraw()
        }),
    )

    const rows = () =>
        sidebarLines(view(), {open: open(), width}).map((row) =>
            element(
                "text",
                {
                    fg: color(api.theme.current, row.tone),
                    onMouseDown: row.toggle
                        ? () => {
                              setOpen((value) => !value)
                              redraw()
                          }
                        : undefined,
                },
                [row.text],
            ),
        )

    return element("box", {width: "100%", flexDirection: "column"}, [rows])
}

/** @type {import("@opencode-ai/plugin/tui").TuiPlugin} */
export const tui = async (api, options) => {
    const width = typeof options?.width === "number" ? options.width : DEFAULT_WIDTH
    api.slots.register({
        order: ORDER,
        slots: {sidebar_content: (_ctx, props) => Section(api, props.session_id, width)},
    })
}

export default {
    id: "obsidian-wikilinks",
    tui,
}
