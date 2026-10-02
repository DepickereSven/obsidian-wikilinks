// Port of obsidian-wikilinks' plugin/lib/read-log.js (buildView, sidebarLines)
// without Node's `path`: the mod environment has no Node.
import type { Link } from './types'

export type Tone = 'title' | 'read' | 'unread' | 'missing' | 'muted'
export type Row = { text: string; tone: Tone; isToggle?: boolean }
export type Item = Link & { read: string[]; state: 'read' | 'unread' | 'missing' }
export type View = { links: Item[]; other: string[]; vaults: string[] }

const isFolder = (p: string) => p.endsWith('/') || p.endsWith('\\')
const withSep = (p: string) => (isFolder(p) ? p : p + '/')

/** Folder links end in a separator and cover every file below them. */
export function covers(linked: string, read: string): boolean {
  return isFolder(linked) ? read.startsWith(linked) : read === linked
}

export function insideVault(vault: string, file: string): boolean {
  return file !== vault && file.startsWith(withSep(vault))
}

/** Every linked note with the reads that satisfy it, plus unlinked vault reads. */
export function buildView(links: readonly Link[], reads: readonly string[]): View {
  const vaults = [...new Set(links.map(l => l.vault))]
  const claimed = new Set<string>()
  const items = links.map(link => {
    const read = reads.filter(file => link.paths.some(p => covers(p, file)))
    read.forEach(file => claimed.add(file))
    const state = link.status === 'missing' ? 'missing' : read.length ? 'read' : 'unread'
    return { ...link, read, state } as Item
  })
  const other = reads.filter(f => !claimed.has(f) && vaults.some(v => insideVault(v, f)))
  return { links: items, other, vaults }
}

/** Re-linking a note keeps its first position but takes the latest resolution. */
export function mergeLinks(existing: readonly Link[], incoming: readonly Link[]): Link[] {
  const merged = [...existing]
  for (const link of incoming) {
    const at = merged.findIndex(l => l.target === link.target)
    if (at === -1) merged.push(link)
    else merged[at] = link
  }
  return merged
}

const ICON = { read: '✓', unread: '○', missing: '✗' } as const

function fit(text: string, width: number): string {
  return text.length > width ? text.slice(0, Math.max(1, width - 1)) + '…' : text
}

function relative(vaults: string[], file: string): string {
  const vault = vaults.find(v => insideVault(v, file))
  return vault ? file.slice(withSep(vault).length) : file
}

export function counts(view: View): { read: number; unread: number } {
  const read = view.links.filter(l => l.state === 'read').length
  return { read, unread: view.links.length - read }
}

/** Empty when the session linked nothing, so nothing shows until then. */
export function paneLines(view: View, { isOpen = true, width = 40 } = {}): Row[] {
  if (!view.links.length) return []
  const { read, unread } = counts(view)
  const rows: Row[] = [
    { text: fit(`${isOpen ? '▼' : '▶'} Obsidian notes  ✓ ${read}  ○ ${unread}`, width), tone: 'title', isToggle: true },
  ]
  if (!isOpen) return rows

  for (const link of view.links) {
    const label = link.paths.length === 1 && isFolder(link.paths[0] ?? "") ? `${link.target}/` : link.target
    let suffix = ''
    if (link.state === 'missing') suffix = ' (no match)'
    else if (link.paths.length > 1 || label.endsWith('/')) suffix = link.read.length ? ` (${link.read.length} read)` : ''
    if (link.status === 'ambiguous' && !link.read.length) suffix = ` (${link.paths.length} candidates)`
    rows.push({ text: fit(`  ${ICON[link.state]} ${label}${suffix}`, width), tone: link.state })
  }
  if (view.other.length) {
    rows.push({ text: fit('  also read', width), tone: 'muted' })
    for (const file of view.other) rows.push({ text: fit(`  · ${relative(view.vaults, file)}`, width), tone: 'muted' })
  }
  return rows
}
