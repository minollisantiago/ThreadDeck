import { afterEach, expect, it, vi } from 'vitest'
import { ConversationSearch, searchableText } from './search.ts'
import { OpenCode } from '@opencode/client'
import { Service } from '@opencode/client/service'
import { source } from './source.ts'

const stores: ConversationSearch[] = []
afterEach(async () => { await Promise.all(stores.splice(0).map(s => s.stop())); vi.restoreAllMocks() })
function setup() { const store = new ConversationSearch(':memory:'); stores.push(store); return store }
const thread = { id: 'old', title: 'Windows startup', project: 'ThreadDeck', threadId: '1561737719133114458', guildId: '1526236793048141935', updatedAt: 1 }

it('searches message words and prefixes, groups by thread, and returns an excerpt', () => {
  const store = setup()
  store.replace(thread, ['A hidden electron loading screen problem', 'Another electron loading issue'])
  store.replace({ ...thread, id: 'new', title: 'Something else' }, ['unrelated'])
  const result = store.search('electron load')
  expect(result.hits).toHaveLength(1)
  expect(result.hits[0]).toMatchObject({ id: 'old', matches: 2 })
  expect(result.hits[0].excerpt).toContain('electron')
  expect(store.search('" OR * (()').hits).toEqual([])
})

it('fuzzy-matches titles and projects and replaces outdated messages atomically', () => {
  const store = setup()
  store.replace(thread, ['obsoletekeyword'])
  expect(store.search('wndstrt').hits[0]?.id).toBe('old')
  expect(store.search('thrdck').hits[0]?.id).toBe('old')
  store.replace({ ...thread, updatedAt: 2 }, ['replacementkeyword'])
  expect(store.search('obsoletekeyword').hits).toHaveLength(0)
  expect(store.search('replacementkeyword').hits).toHaveLength(1)
})

it('only extracts user text and assistant visible text, never tools or reasoning', () => {
  expect(searchableText({ type: 'user', text: ' user question ' })).toBe('user question')
  expect(searchableText({ type: 'assistant', content: [{ type: 'reasoning', text: 'secret' }, { type: 'text', text: 'answer' }, { type: 'tool', text: 'output' }] })).toBe('answer')
  expect(searchableText({ type: 'system', text: 'hidden' })).toBe('')
})

it('walks historical session and message pages, skips unchanged history and reconciles deleted sessions', async () => {
  const store = setup()
  vi.spyOn(source, 'projects').mockResolvedValue([{ directory: '/project', channelId: 'channel', guildId: thread.guildId }])
  vi.spyOn(Service, 'discover').mockResolvedValue({ url: 'http://localhost' } as Awaited<ReturnType<typeof Service.discover>>)
  vi.spyOn(Service, 'headers').mockReturnValue({ authorization: 'test' })
  const raw = { id: 'old', title: thread.title, location: { directory: '/project' }, time: { updated: 1 }, metadata: { kimaki: { threadId: thread.threadId } } }
  const sessions = vi.fn().mockImplementation(async ({ cursor, order }) => {
    if (cursor && order) throw new Error('Cursor cannot be combined with order')
    return cursor ? { data: [raw], cursor: {} } : { data: [], cursor: { next: 'historical' } }
  })
  const messages = vi.fn().mockImplementation(async ({ cursor, order }) => {
    if (cursor && order) throw new Error('Cursor cannot be combined with order')
    return { data: [{ type: 'user', text: cursor ? 'deep historical keyword' : 'first page' }], cursor: cursor ? {} : { next: 'older' } }
  })
  vi.spyOn(OpenCode, 'make').mockReturnValue({ session: { list: sessions }, message: { list: messages } } as unknown as ReturnType<typeof OpenCode.make>)
  await store.refresh()
  expect(sessions).toHaveBeenCalledTimes(2)
  expect(messages).toHaveBeenCalledTimes(2)
  expect(store.search('historical').hits[0]?.id).toBe('old')
  await store.refresh()
  expect(messages).toHaveBeenCalledTimes(2)
  sessions.mockRejectedValueOnce(new Error('offline'))
  await store.refresh()
  expect(store.search('historical').error).toBeTruthy()
  expect(store.search('historical').hits).toHaveLength(1)
  sessions.mockResolvedValue({ data: [], cursor: {} })
  await store.refresh()
  expect(store.search('').indexed).toBe(0)
})
