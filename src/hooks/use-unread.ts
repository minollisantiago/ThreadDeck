import { useEffect, useState } from 'react'
import type { Project, Session } from '../../shared/model'
import { readKey, unreadSessions, type ReadResponses } from '../lib/unread'

const storageKey = 'threaddeck:read-responses'
function load(): ReadResponses {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '{}')
    if (value && typeof value === 'object' && !Array.isArray(value)
      && Object.values(value).every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0)) return value as ReadResponses
  } catch { /* Local unread state is optional. */ }
  return {}
}

export function useUnread(projects: Project[]) {
  const [read, setRead] = useState(load)
  useEffect(() => {
    try {
      const merged = { ...load() }
      for (const [key, value] of Object.entries(read)) merged[key] = Math.max(merged[key] ?? 0, value)
      localStorage.setItem(storageKey, JSON.stringify(merged))
      window.dispatchEvent(new Event('threaddeck:read-receipts'))
    } catch { /* Storage may be unavailable. */ }
  }, [read])
  useEffect(() => {
    function storage(event: StorageEvent) { if (event.key === storageKey || event.key === null) setRead(load()) }
    function local() { const next = load(); setRead(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next) }
    window.addEventListener('storage', storage)
    window.addEventListener('threaddeck:read-receipts', local)
    return () => { window.removeEventListener('storage', storage); window.removeEventListener('threaddeck:read-receipts', local) }
  }, [])
  function markRead(session: Session) {
    if (session.responseAt == null) return
    const key = readKey(session.projectId, session.threadId)
    const timestamp = session.responseAt
    setRead(previous => (previous[key] ?? 0) >= timestamp ? previous : { ...previous, [key]: timestamp })
  }
  const unread = unreadSessions(projects, read)
  function markProjectsRead(projectId?: string) {
    setRead(previous => {
      const next = { ...previous }
      for (const project of projects) {
        if (projectId !== undefined && project.id !== projectId) continue
        for (const session of project.sessions) {
          if (!unread.has(session.id) || session.responseAt == null) continue
          const key = readKey(session.projectId, session.threadId)
          next[key] = Math.max(next[key] ?? 0, session.responseAt)
        }
      }
      return next
    })
  }
  function markAllRead() { markProjectsRead() }
  function markProjectRead(projectId: string) { markProjectsRead(projectId) }
  return { unread, markRead, markAllRead, markProjectRead }
}
