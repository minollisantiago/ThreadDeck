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
    try { localStorage.setItem(storageKey, JSON.stringify(read)) } catch { /* Storage may be unavailable. */ }
  }, [read])
  useEffect(() => {
    function storage(event: StorageEvent) { if (event.key === storageKey || event.key === null) setRead(load()) }
    window.addEventListener('storage', storage)
    return () => window.removeEventListener('storage', storage)
  }, [])
  function markRead(session: Session) {
    if (session.responseAt == null) return
    const key = readKey(session.projectId, session.threadId)
    const timestamp = session.responseAt
    setRead(previous => ({ ...previous, [key]: Math.max(previous[key] ?? 0, timestamp) }))
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
