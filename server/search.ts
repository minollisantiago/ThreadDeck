import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { homedir } from 'node:os'
import { OpenCode } from '@opencode/client'
import { Service } from '@opencode/client/service'
import { z } from 'zod'
import { fuzzyScore, type SearchHit, type SearchResponse } from '../shared/search.ts'
import { projectFor } from './monitor.ts'
import { rawSessionSchema, source } from './source.ts'

const messageSchema = z.object({
  type: z.string(), text: z.string().optional(), content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional(),
})
export function searchableText(value: unknown) {
  const message = messageSchema.parse(value)
  if (message.type !== 'user' && message.type !== 'assistant') return ''
  if (message.type === 'user') return message.text?.trim() ?? ''
  return (message.content ?? []).filter(p => p.type === 'text').map(p => p.text ?? '').join('\n').trim()
}

export class ConversationSearch {
  private db: DatabaseSync
  private timer?: ReturnType<typeof setInterval>
  private stopped = false
  private pending?: Promise<void>
  private indexing = false
  private error: string | null = null

  constructor(filename: string) {
    this.db = new DatabaseSync(filename)
    this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS threads (id TEXT PRIMARY KEY, title TEXT, project TEXT, threadId TEXT, guildId TEXT, updatedAt INTEGER);
      CREATE VIRTUAL TABLE IF NOT EXISTS messages USING fts5(session UNINDEXED, text, tokenize='unicode61');`)
  }

  replace(hit: Omit<SearchHit, 'excerpt' | 'matches'>, messages: string[]) {
    this.db.exec('BEGIN')
    try {
      this.db.prepare('INSERT OR REPLACE INTO threads VALUES (?, ?, ?, ?, ?, ?)').run(hit.id, hit.title, hit.project, hit.threadId, hit.guildId, hit.updatedAt)
      this.db.prepare('DELETE FROM messages WHERE session = ?').run(hit.id)
      const insert = this.db.prepare('INSERT INTO messages VALUES (?, ?)')
      for (const text of messages) if (text) insert.run(hit.id, text)
      this.db.exec('COMMIT')
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
  }

  search(input: string): SearchResponse {
    const query = input.trim().slice(0, 200)
    const threads = this.db.prepare('SELECT * FROM threads ORDER BY updatedAt DESC').all() as unknown as Omit<SearchHit, 'excerpt' | 'matches'>[]
    const ranked = new Map<string, SearchHit & { score: number }>()
    for (const thread of threads) {
      const score = query ? Math.max(fuzzyScore(query, thread.title), fuzzyScore(query, thread.project)) : 1
      if (score) ranked.set(thread.id, { ...thread, excerpt: '', matches: 0, score: score + 20 })
    }
    const tokens = query.match(/[\p{L}\p{N}_]+/gu) ?? []
    if (tokens.length) {
      const expression = tokens.map(t => `"${t}"*`).join(' AND ')
      const rows = this.db.prepare(`SELECT session, snippet(messages, 1, '', '', '…', 32) AS excerpt, rank
        FROM messages WHERE messages MATCH ? ORDER BY rank LIMIT 500`).all(expression)
      const byId = new Map(threads.map(t => [t.id, t]))
      for (const row of rows) {
        const id = String(row.session), thread = byId.get(id)
        if (!thread) continue
        const existing = ranked.get(id)
        if (existing) { existing.matches++; if (!existing.excerpt) existing.excerpt = String(row.excerpt) }
        else ranked.set(id, { ...thread, excerpt: String(row.excerpt), matches: 1, score: 15 - Number(row.rank) })
      }
    }
    const hits = [...ranked.values()].sort((a, b) => b.score - a.score || b.updatedAt - a.updatedAt).slice(0, 40)
      .map(({ score: _score, ...hit }) => hit)
    return { hits, indexed: threads.length, indexing: this.indexing, error: this.error }
  }

  start() {
    void this.refresh()
    this.timer = setInterval(() => { void this.refresh() }, 60_000)
  }

  refresh() {
    if (this.pending || this.stopped) return this.pending ?? Promise.resolve()
    this.pending = this.update().finally(() => { this.pending = undefined })
    return this.pending
  }

  private async update() {
    this.indexing = true
    try {
      const registrations = await source.projects()
      const endpoint = await Service.discover({ file: process.env.KIMAKI_OPENCODE_SERVICE_FILE })
      if (!endpoint) throw new Error('Unavailable')
      const client = OpenCode.make({ baseUrl: endpoint.url, headers: Service.headers(endpoint) })
      const options = () => ({ signal: AbortSignal.timeout(15_000) })
      let cursor: string | undefined
      const seen = new Set<string>()
      const guilds = new Map<string, string | null>()
      let incomplete = false
      do {
        // Continuation cursors carry their ordering; repeating it is rejected by the API.
        const page = await client.session.list(cursor ? { limit: 100, cursor } : { limit: 100, order: 'desc' }, options())
        for (const value of page.data) {
          if (this.stopped) return
          const raw = rawSessionSchema.parse(value), project = projectFor(raw, registrations)
          const threadId = raw.metadata?.kimaki?.threadId
          if (!project || !threadId || !/^\d{17,20}$/.test(threadId)) continue
          seen.add(raw.id)
          try {
            let guildId = project.guildId ?? guilds.get(project.channelId) ?? null
            if (!guildId && !guilds.has(project.channelId)) {
              guildId = await source.guild(raw.id).catch(() => null)
              guilds.set(project.channelId, guildId)
            }
            const cached = this.db.prepare('SELECT updatedAt, guildId FROM threads WHERE id = ?').get(raw.id)
            if (cached?.updatedAt === raw.time.updated && cached.guildId === guildId) continue
            const texts: string[] = []
            let messageCursor: string | undefined
            do {
              const messages = await client.message.list({ sessionID: raw.id, limit: 100,
                ...(messageCursor ? { cursor: messageCursor } : { order: 'asc' as const }),
              }, options())
              if (this.stopped) return
              for (const message of messages.data) { const text = searchableText(message); if (text) texts.push(text) }
              messageCursor = messages.cursor.next ?? undefined
            } while (messageCursor)
            this.replace({ id: raw.id, title: raw.title || 'Untitled session', project: path.basename(project.directory), threadId, guildId, updatedAt: raw.time.updated }, texts)
          } catch { incomplete = true } // A missing/busy session must not bury older history forever.
        }
        cursor = page.cursor.next ?? undefined
      } while (cursor && !this.stopped)
      if (!this.stopped && !incomplete) {
        // Reconcile only after a complete successful sweep; outages retain cached history.
        for (const row of this.db.prepare('SELECT id FROM threads').all()) if (!seen.has(String(row.id))) {
          this.db.prepare('DELETE FROM messages WHERE session = ?').run(row.id)
          this.db.prepare('DELETE FROM threads WHERE id = ?').run(row.id)
        }
      }
      this.error = incomplete ? 'Some conversations could not sync. Showing available history; retrying automatically.' : null
    } catch { this.error = 'History sync unavailable. Showing cached conversations; retrying automatically.' }
    finally { this.indexing = false }
  }

  async stop() { this.stopped = true; clearInterval(this.timer); await this.pending; this.db.close() }
}

export function createConversationSearch() {
  const directory = process.env.THREADDECK_DATA_DIR ?? path.join(homedir(), '.local', 'share', 'threaddeck')
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  return new ConversationSearch(path.join(directory, 'search.sqlite'))
}
