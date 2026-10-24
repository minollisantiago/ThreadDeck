import { useEffect, useRef, useState } from 'react'
import { changesSchema, historySchema, type PublishedMessage } from '../../shared/chat'
import { chatRequest } from './api'

export function mergeMessages(previous: PublishedMessage[], messages: PublishedMessage[], deleted: string[] = []) {
  const map = new Map(previous.map(message => [message.id, message]))
  for (const id of deleted) map.delete(id)
  for (const message of messages) map.set(message.id, message)
  return [...map.values()].sort((a, b) => BigInt(a.id) < BigInt(b.id) ? -1 : 1)
}
function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>(resolve => { const done = () => { clearTimeout(timer); signal.removeEventListener('abort', done); resolve() }; const timer = setTimeout(done, ms); signal.addEventListener('abort', done, { once: true }); if (signal.aborted) done() })
}
export function useConversation(threadId?: string, retry = 0) {
  const [messages, setMessages] = useState<PublishedMessage[]>([])
  const [before, setBefore] = useState<string | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(Boolean(threadId)), [stale, setStale] = useState(false)
  const controller = useRef<AbortController | null>(null)
  useEffect(() => {
    if (!threadId) return
    setError(''); setLoading(true)
    const abort = new AbortController(); controller.current = abort
    let cursor = '', retries = 0
    void (async () => {
      while (!abort.signal.aborted) {
        try {
          if (!cursor) {
            const page = await chatRequest(`threads/${threadId}/messages`, historySchema, { signal: abort.signal })
            if (abort.signal.aborted) return
            setMessages(page.messages); setBefore(page.before); setStale(page.stale); cursor = page.cursor; setError(''); setLoading(false)
          }
          const delta = await chatRequest(`threads/${threadId}/changes?cursor=${encodeURIComponent(cursor)}`, changesSchema, { signal: abort.signal })
          if (abort.signal.aborted) return
          setError(''); setStale(delta.stale); retries = 0
          if (delta.resync) { cursor = ''; continue }
          cursor = delta.cursor
          if (delta.changes.length) setMessages(previous => mergeMessages(previous, delta.changes.flatMap(c => c.type === 'upsert' ? [c.message] : []), delta.changes.flatMap(c => c.type === 'delete' ? [c.id] : [])))
        } catch (error) {
          if (abort.signal.aborted) return
          setError(error instanceof Error ? error.message : 'Conversation unavailable'); setLoading(false); setStale(true)
          await delay(Math.min(30_000, 1000 * 2 ** retries++), abort.signal); cursor = ''
        }
      }
    })()
    return () => abort.abort()
  }, [threadId, retry])
  async function earlier() {
    if (!threadId || !before) return
    const page = await chatRequest(`threads/${threadId}/messages?before=${before}`, historySchema, { signal: controller.current?.signal })
    setMessages(previous => mergeMessages(page.messages, previous)); setBefore(page.before)
  }
  return { messages, before, error, loading, stale, earlier }
}
