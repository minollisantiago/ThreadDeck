import type { ChatCatalog } from './chat'

export type SlashEntry = ChatCatalog['entries'][number]
export const modelCommands = ['models', 'model', 'thinking', 'variants', 'effort', 'model-variant'] as const
export const modelControls: SlashEntry[] = modelCommands.map(name => ({ kind: 'control', name, description: name === 'models' || name === 'model' ? 'Switch session model' : 'Switch model variant / thinking effort' }))
export function invocation(entry: SlashEntry, entries: SlashEntry[] = []) {
  if (entry.kind === 'skill') return `/${entry.name}-skill`
  // Preserve exact command names even when a control or skill uses the same spelling.
  if (entry.kind === 'command' && (['command', 'skill'].includes(entry.name) || modelCommands.some(name => name === entry.name) || entries.some(other => other.kind === 'skill' && `${other.name}-skill` === entry.name))) return `/command ${entry.name}`
  return `/${entry.name}`
}
export function parseInvocation(text: string, entries: SlashEntry[]) {
  const value = text.trimStart()
  const explicit = /^\/(command|skill)\s+(\S+)(?:\s+([\s\S]*))?$/.exec(value)
  if (explicit) {
    const entry = entries.find(entry => entry.kind === explicit[1] && entry.name === explicit[2])
    return entry ? { ...entry, arguments: explicit[3] || '' } : undefined
  }
  return entries.map(entry => ({ ...entry, prefix: invocation(entry, entries) })).sort((a, b) => b.prefix.length - a.prefix.length)
    .filter(entry => value === entry.prefix || value.startsWith(`${entry.prefix} `) || value.startsWith(`${entry.prefix}\n`))
    .map(entry => ({ ...entry, arguments: value.slice(entry.prefix.length).trimStart() }))[0]
}
export function slashMatches(query: string, entries: SlashEntry[]) {
  const needle = query.replace(/^\//, '').toLowerCase()
  const score = (entry: SlashEntry) => {
    const name = invocation(entry, entries).slice(1).toLowerCase(), description = entry.description?.toLowerCase() || ''
    if (name.startsWith(needle)) return 0
    if (name.includes(needle)) return 1
    if (description.includes(needle)) return 2
    let cursor = 0
    for (const letter of name) if (letter === needle[cursor]) cursor++
    return cursor === needle.length ? 3 : Infinity
  }
  return entries.map(entry => ({ entry, rank: score(entry) })).filter(hit => Number.isFinite(hit.rank))
    .sort((a, b) => a.rank - b.rank || invocation(a.entry, entries).localeCompare(invocation(b.entry, entries))).map(hit => hit.entry)
}
export function entryCategory(entry: SlashEntry) { return entry.kind === 'control' ? 'Session control' : entry.kind === 'skill' ? 'Skill' : entry.name.includes(':') ? 'MCP prompt' : 'Command' }
