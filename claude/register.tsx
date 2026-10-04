// Claude Code mod for obsidian-wikilinks: an "Obsidian notes" pane listing every
// note this session's prompts linked with [[wikilinks]], marked ✓ read or ○ not.
//
// The plugin's UserPromptSubmit hook (hooks/hooks.json) still injects the
// context; this module runs the same resolver only to learn what was linked,
// and watches Read calls. Claude Code counterpart of plugin/tui.js.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Link } from './types'
import { buildView, counts, insideVault, mergeLinks, paneLines } from './view'
import type { Tone } from './view'

const PANE = 'obsidian-notes'
const OPEN = { id: PANE, title: 'Obsidian notes', columns: 40 }
const WIKILINK = /\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/
const links = atom({ plugin: 'obsidian-wikilinks', key: 'links' } as const, [])
const reads = atom({ plugin: 'obsidian-wikilinks', key: 'reads' } as const, [])

const TONE: Record<Tone, { color?: string; dimColor?: boolean; bold?: boolean }> = {
  title: { bold: true },
  read: { color: 'success' },
  unread: { color: 'warning' },
  missing: { color: 'error' },
  muted: { dimColor: true },
}

type Resolution = { vault: string; links: Omit<Link, 'vault'>[] }

async function resolve($: EngineInterface, prompt: string) {
  try {
    const script = `${$.plugin.root}/hooks/wikilink-resolver.py`
    const ran = await $.process.run(['python3', script], {
      stdin: JSON.stringify({ prompt }),
      env: { OBSIDIAN_WIKILINKS_HOST: 'claude', OBSIDIAN_WIKILINKS_EMIT_LINKS: '1' },
      timeoutMs: 10_000,
    })
    if (ran.exitCode !== 0 || !ran.stdout.trim()) return null
    const found = JSON.parse(ran.stdout).obsidianWikilinks as Resolution | undefined
    return found?.vault && found.links?.length ? found : null
  } catch {
    return null
  }
}

async function showStatus($: EngineInterface) {
  const view = buildView(await read($, links), await read($, reads))
  const { read: done, unread } = counts(view)
  $.ui.status(view.links.length ? `Obsidian ✓ ${done} ○ ${unread}` : undefined)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'obsidian-notes',
      description: 'Show or hide the pane of [[wikilinked]] Obsidian notes the agent has read',
    })
    await showStatus($)

    return next(e)
  })

  on('command.run', { command: 'obsidian-notes' }, async $ => {
    // A pane opened unasked on a narrow terminal waits unplaced; the command places it.
    const shown = (await $.ui.panes()).some(pane => pane.id === PANE && pane.isPlaced)
    if (shown) {
      await $.ui.close({ id: PANE })
      return { text: 'Obsidian notes pane hidden. /obsidian-notes shows it again.' }
    }

    await $.ui.open(OPEN)
    return { text: 'Obsidian notes pane opened.' }
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      await update($, links, () => [])
      await update($, reads, () => [])
      $.ui.status(undefined)
    }

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    if (!WIKILINK.test(e.text)) return next(e)

    const [ran, found] = await Promise.all([next(e), resolve($, e.text)])
    if (found) {
      const incoming = found.links.map(link => ({ ...link, vault: found.vault }))
      const before = await read($, links)
      await update($, links, list => mergeLinks(list ?? [], incoming))
      await showStatus($)
      if (!before.length) void $.ui.open(OPEN)
    }

    return ran
  })

  on('tool.call', { tool: 'Read' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError) return ran

    const vaults = new Set((await read($, links)).map(l => l.vault))
    const file = e.file_path
    if ([...vaults].some(v => insideVault(v, file))) {
      await update($, reads, list => (list?.includes(file) ? list : [...(list ?? []), file]))
      await showStatus($)
    }

    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const view = buildView(await read($, links), await read($, reads))
    const width = Math.max(10, e.props.bodyColumns ?? e.viewport?.columns ?? 40)
    const rows = paneLines(view, { width }).slice(1) // the pane title stands for the header row

    return (
      <Box flexDirection="column">
        {rows.length === 0 && <Text dimColor>No [[wikilinks]] in this session yet.</Text>}
        {rows.map(row => (
          <Text {...TONE[row.tone]}>{row.text}</Text>
        ))}
      </Box>
    )
  })
}
