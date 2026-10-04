import { expect, test } from 'claude-code/testing'

test('/obsidian-notes toggles the pane', async ($, on) => {
  const opened: string[] = []
  const closed: string[] = []
  let open = false
  on('ui.panes', async () => ({
    value: open ? [{ id: 'obsidian-notes', title: 'Obsidian notes', isShown: true, isFocused: false, isPlaced: true }] : [],
  }))
  on('ui.open', async (_$, e) => {
    opened.push(e.id)
    open = true
    return { value: { isPlaced: true } }
  })
  on('ui.close', async (_$, e) => {
    closed.push(e.id)
    open = false
    return { value: undefined }
  })

  await $.command.run({ command: 'obsidian-notes', args: '' })
  expect(opened).toEqual(['obsidian-notes'])

  await $.command.run({ command: 'obsidian-notes', args: '' })
  expect(closed).toEqual(['obsidian-notes'])

  await $.command.run({ command: 'obsidian-notes', args: '' })
  expect(opened).toEqual(['obsidian-notes', 'obsidian-notes'])
})
