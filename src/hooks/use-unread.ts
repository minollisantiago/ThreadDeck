import { useEffect, useState } from 'react'
import type { Project, Session } from '../../shared/model'
import { readKey, unreadSessions, type ReadResponses } from '../lib/unread'

const storageKey = 'threaddeck:read-responses'
const unreadStorageKey = 'threaddeck:manual-unread'
function loadManualUnread(): Record<string, boolean> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(unreadStorageKey) ?? '{}')
    if (value && typeof value === 'object' && !Array.isArray(value)
      && Object.values(value).every(v => typeof v === 'boolean')) return value as Record<string, boolean>
  } catch { /* Local unread state is optional. */ }
  return {}
}
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
  const [manualUnread, setManualUnread] = useState(loadManualUnread)
  useEffect(() => {
    try {
      const merged = { ...load() }
      for (const [key, value] of Object.entries(read)) merged[key] = Math.max(merged[key] ?? 0, value)
      localStorage.setItem(storageKey, JSON.stringify(merged))
      window.threaddeckDesktop?.readReceipts?.(merged)
      window.dispatchEvent(new Event('threaddeck:read-receipts'))
    } catch { /* Storage may be unavailable. */ }
  }, [read])
  useEffect(() => {
    function local() {
      const next = load(), manual = loadManualUnread()
      setRead(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next)
      setManualUnread(previous => JSON.stringify(previous) === JSON.stringify(manual) ? previous : manual)
    }
    function storage(event: StorageEvent) { if (event.key === storageKey || event.key === unreadStorageKey || event.key === null) local() }
    window.addEventListener('storage', storage)
    window.addEventListener('threaddeck:read-receipts', local)
    return () => { window.removeEventListener('storage', storage); window.removeEventListener('threaddeck:read-receipts', local) }
  }, [])
  function updateManualUnread(keys: string[], unread: boolean) {
    const next = { ...loadManualUnread(), ...manualUnread }
    for (const key of keys) {
      if (unread) next[key] = true
      else delete next[key]
    }
    setManualUnread(next)
    try {
      localStorage.setItem(unreadStorageKey, JSON.stringify(next))
      window.dispatchEvent(new Event('threaddeck:read-receipts'))
    } catch { /* Storage may be unavailable. */ }
  }
  function markUnread(session: Session) {
    window.dispatchEvent(new CustomEvent('threaddeck:mark-unread', { detail: session.id }))
    updateManualUnread([readKey(session.projectId, session.threadId)], true)
  }
  function markRead(session: Session) {
    const key = readKey(session.projectId, session.threadId)
    if (manualUnread[key]) updateManualUnread([key], false)
    if (session.responseAt == null) return
    const timestamp = session.responseAt
    setRead(previous => (previous[key] ?? 0) >= timestamp ? previous : { ...previous, [key]: timestamp })
  }
  const unread = unreadSessions(projects, read)
  for (const project of projects) for (const session of project.sessions) {
    if (manualUnread[readKey(session.projectId, session.threadId)]) unread.add(session.id)
  }
  function markProjectsRead(projectId?: string) {
    updateManualUnread(projects.filter(project => projectId === undefined || project.id === projectId)
      .flatMap(project => project.sessions.map(session => readKey(session.projectId, session.threadId))), false)
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
  return { unread, markRead, markUnread, markAllRead, markProjectRead }
}
