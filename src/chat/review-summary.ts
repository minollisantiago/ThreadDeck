import { z } from 'zod'
import { historySchema, type PublishedMessage } from '../../shared/chat'
import type { Session } from '../../shared/model'
import { chatRequest } from './api'
import { displayPublishedMessage, groupPublishedMessages } from './message-groups'
import { publishedMarkdown } from './published-markdown'

// Extract the published exchange; preparation never invokes an agent or writes a read receipt.
export function exchangePreview(messages: PublishedMessage[]) {
  const meaningful = groupPublishedMessages(messages).map(group => ({ role: group.role, text: publishedMarkdown(group.messages.map(displayPublishedMessage)).replace(/^-# .*$/gm, '').trim() })).filter(group => group.text)
  const agent = meaningful.findLast(group => group.role === 'assistant')
  const user = meaningful.findLast(group => group.role !== 'assistant')
  const excerpt = (content?: string) => {
    if (!content) return null
    const text = content.replace(/```[\s\S]*?```/g, ' [code] ').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/https?:\/\/\S+/g, '[link]').replace(/[#*_`~]/g, '').replace(/\s+/g, ' ').trim()
    return text.length > 440 ? `${text.slice(0, 439)}…` : text
  }
  return { user: excerpt(user?.text), agent: excerpt(agent?.text) }
}
export type ReviewPreview = { exchange: ReturnType<typeof exchangePreview> | null; stale: boolean; error: string }
const unavailable = (): ReviewPreview => ({ exchange: null, stale: false, error: 'The latest exchange could not be loaded.' })
const seedSchema = z.object({ state: z.enum(['ready', 'skipped', 'failed']), items: z.array(z.object({ threadId: z.string(), version: z.number().finite(), history: z.unknown() })) })
const key = (session: Pick<Session, 'threadId' | 'responseAt' | 'updatedAt'>) => `${session.threadId}:${session.responseAt ?? session.updatedAt}`
const preview = (history: z.infer<typeof historySchema>): ReviewPreview => ({ exchange: exchangePreview(history.messages), stale: history.stale, error: '' })

// One cache per workspace/launch. Promises coalesce startup, tab and retry consumers.
export class ReviewSummaryCache {
  private results = new Map<string, Promise<ReviewPreview>>()
  private hydration: Promise<void> | null = null
  private desktopFailed = false
  private hydrate() {
    this.hydration ??= (async () => {
      let timeout: ReturnType<typeof setTimeout> | undefined
      try {
        if (!window.threaddeckDesktop?.reviewSummary) return
        const raw = await Promise.race([window.threaddeckDesktop.reviewSummary(), new Promise(resolve => { timeout = setTimeout(() => resolve(null), 1000) })])
        const seed = seedSchema.safeParse(raw)
        if (!seed.success) return
        this.desktopFailed = seed.data.state === 'failed' && !seed.data.items.length
        for (const item of seed.data.items) {
          const history = historySchema.safeParse(item.history)
          this.results.set(`${item.threadId}:${item.version}`, Promise.resolve(history.success ? preview(history.data) : unavailable()))
        }
      } catch { /* Older desktop runtimes can use browser preparation. */ }
      finally { clearTimeout(timeout) }
    })()
    return this.hydration
  }
  async get(session: Session, retry = false, signal?: AbortSignal): Promise<ReviewPreview> {
    await this.hydrate()
    const id = key(session)
    if (retry) this.results.delete(id)
    if (!this.results.has(id)) {
      const result = this.desktopFailed && !retry ? Promise.resolve(unavailable()) : chatRequest(`threads/${encodeURIComponent(session.threadId)}/messages`, historySchema, {
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000),
      }).then(preview).catch(unavailable)
      this.results.set(id, result)
    }
    return this.results.get(id)!
  }
  async prepare(sessions: Session[]) {
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 8000)
    let index = 0
    try {
      await Promise.all(Array.from({ length: Math.min(4, sessions.length) }, async () => {
        while (index < sessions.length) await this.get(sessions[index++], false, controller.signal)
      }))
    } finally { clearTimeout(timeout) }
  }
}
