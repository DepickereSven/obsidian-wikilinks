export type LinkStatus = 'resolved' | 'ambiguous' | 'missing'
export type Link = { target: string; status: LinkStatus; paths: string[]; vault: string }

declare module 'claude-code' {
  interface PluginState {
    'obsidian-wikilinks': { links: Link[]; reads: string[] }
  }
}
