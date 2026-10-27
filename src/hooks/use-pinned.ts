import { createContext, useCallback, useEffect, useState } from 'react'
import type { Project, Session } from '../../shared/model'

const storageKey = 'threaddeck:pinned-threads'
const eventName = 'threaddeck:pins-changed'
const key = (session: Session) => `${session.projectId}:${session.threadId}`
function load(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) || '[]')
    if (Array.isArray(value) && value.every(item => typeof item === 'string')) return value
  } catch { /* Pinning remains available in memory if storage is unavailable. */ }
  return []
}
export const PinnedSessions = createContext<{ pinned: ReadonlySet<string>; togglePin: (session: Session) => void } | null>(null)

export function usePinned(projects: Project[]) {
  const [keys, setKeys] = useState(load)
  useEffect(() => {
    const sync = () => { const next = load(); setKeys(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next) }
    const storage = (event: StorageEvent) => { if (event.key === storageKey || event.key === null) sync() }
    window.addEventListener(eventName, sync); window.addEventListener('storage', storage)
    return () => { window.removeEventListener(eventName, sync); window.removeEventListener('storage', storage) }
  }, [])
  const togglePin = useCallback((session: Session) => {
    setKeys(previous => {
      const next = previous.includes(key(session)) ? previous.filter(item => item !== key(session)) : [...previous, key(session)]
      return next
    })
  }, [])
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(keys)); window.dispatchEvent(new Event(eventName)) } catch { /* Optional local preference. */ }
  }, [keys])
  const stored = new Set(keys), pinned = new Set(projects.flatMap(project => project.sessions.filter(session => stored.has(key(session))).map(session => session.id)))
  return { pinned, togglePin }
}
