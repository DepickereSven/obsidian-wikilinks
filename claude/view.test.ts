import { expect, test } from 'claude-code/testing'

import type { Link } from './types'
import { buildView, mergeLinks, paneLines } from './view'

const V = '/vault'
const links: Link[] = [
  { target: 'Plan', status: 'resolved', paths: ['/vault/Plan.md'], vault: V },
  { target: 'Meetings', status: 'resolved', paths: ['/vault/Meetings/'], vault: V },
  { target: 'Nope', status: 'missing', paths: [], vault: V },
]

test('marks read, unread, missing and also-read notes', () => {
  const view = buildView(links, ['/vault/Meetings/a.md', '/vault/Other.md', '/elsewhere/x.md'])
  expect(view.links.map(l => l.state)).toEqual(['unread', 'read', 'missing'])
  expect(view.other).toEqual(['/vault/Other.md'])
  expect(paneLines(view, { width: 60 }).map(r => r.text)).toEqual([
    '▼ Obsidian notes  ✓ 1  ○ 2',
    '  ○ Plan',
    '  ✓ Meetings/ (1 read)',
    '  ✗ Nope (no match)',
    '  also read',
    '  · Other.md',
  ])
})

test('re-linking keeps position, takes latest resolution', () => {
  const merged = mergeLinks(links, [{ target: 'Nope', vault: V, status: 'resolved', paths: ['/vault/Nope.md'] }])
  expect(merged.map(l => l.target)).toEqual(['Plan', 'Meetings', 'Nope'])
  expect(merged[2]?.status).toBe('resolved')
})

test('nothing linked shows nothing', () => {
  expect(paneLines(buildView([], ['/vault/a.md']))).toEqual([])
})
