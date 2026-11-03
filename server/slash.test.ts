import { expect, it } from 'vitest'
import { entryCategory, invocation, modelControls, parseInvocation, slashMatches, type SlashEntry } from '../shared/slash'

const entries: SlashEntry[] = [...modelControls, { kind: 'skill', name: 'research', description: 'Investigate primary sources' }, { kind: 'command', name: 'docs:find', description: 'Search documentation' }, { kind: 'command', name: 'review' }]
it('keeps the full catalog searchable by prefix, description and fuzzy spelling', () => {
  const catalog: SlashEntry[] = [...entries, ...Array.from({ length: 30 }, (_, index) => ({ kind: 'command' as const, name: `extra${index}` }))]
  expect(slashMatches('/', catalog)).toHaveLength(catalog.length)
  expect(slashMatches('/PRIMARY SOURCES', entries)[0].name).toBe('research')
  expect(slashMatches('/rsrch', entries)[0].name).toBe('research')
  expect(slashMatches('/model', entries).map(entry => entry.name)).toContain('models')
  expect(slashMatches('/nonexistent', entries)).toEqual([])
})
it('parses exact names, MCP prompts, skills, aliases and multiline arguments', () => {
  expect(parseInvocation('/docs:find react "server components"', entries)).toMatchObject({ kind: 'command', name: 'docs:find', arguments: 'react "server components"' })
  expect(parseInvocation('/research-skill\nFind evidence', entries)).toMatchObject({ kind: 'skill', name: 'research', arguments: 'Find evidence' })
  expect(parseInvocation('/effort high', entries)).toMatchObject({ kind: 'control', arguments: 'high' })
  expect(parseInvocation('/reviews', entries)).toBeUndefined()
  expect(entryCategory(entries[7])).toBe('MCP prompt')
})
it('disambiguates command names that collide with controls or skill shortcuts', () => {
  const controls: SlashEntry[] = [...entries, { kind: 'command', name: 'models' }, { kind: 'command', name: 'research-skill' }]
  expect(invocation(controls.at(-2)!, controls)).toBe('/command models')
  expect(parseInvocation('/models', controls)?.kind).toBe('control')
  expect(parseInvocation('/command models args', controls)).toMatchObject({ kind: 'command', name: 'models', arguments: 'args' })
  expect(invocation(controls.at(-1)!, controls)).toBe('/command research-skill')
  expect(parseInvocation('/research-skill', controls)?.kind).toBe('skill')
  expect(parseInvocation('/skill research args', controls)?.kind).toBe('skill')
})
