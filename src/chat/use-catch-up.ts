import { useEffect, useState } from 'react'
import type { Project, Session } from '../../shared/model'
import { readKey } from '../lib/unread'

export type CatchUpEntry = { session: Session; project: Pick<Project, 'id' | 'name'> }
const storageKey = 'threaddeck:catch-up-seen'
export function catchUpVersion(session: Session) { return session.responseAt ?? session.updatedAt }
export function loadCatchUpSeen(): Record<string, number> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '{}')
    if (value && typeof value === 'object' && !Array.isArray(value)
      && Object.values(value).every(item => typeof item === 'number' && Number.isFinite(item) && item >= 0)) return value as Record<string, number>
  } catch { /* Catch-up is still available when local preferences cannot be read. */ }
  return {}
}
export function unseenCatchUp(entries: CatchUpEntry[], seen: Record<string, number>) {
  return entries.filter(({ session }) => catchUpVersion(session) > (seen[readKey(session.projectId, session.threadId)] ?? -1))
}

export function useCatchUp(projects: Project[], unread: ReadonlySet<string>) {
  const [seen, setSeen] = useState(loadCatchUpSeen)
  const [visible, setVisible] = useState(false), [tabOpen, setTabOpen] = useState(false)
  const [entries, setEntries] = useState<CatchUpEntry[]>([])
  const pending = projects.flatMap(project => project.sessions.filter(session => unread.has(session.id)).map(session => ({ session, project: { id: project.id, name: project.name } })))
  const unseen = unseenCatchUp(pending, seen)
  // The batch survives thread navigation (and the conversation's own read receipt).
  // Only newer unread activity updates it; seeing the summary is not a read receipt.
  function mergePending(previous: CatchUpEntry[]) {
    const merged = new Map(previous.map(entry => [entry.session.id, entry]))
    for (const entry of pending) merged.set(entry.session.id, entry)
    return [...merged.values()]
  }
  function open() { setEntries(previous => mergePending(tabOpen ? previous : [])); setTabOpen(true); setVisible(true) }
  function close() { setTabOpen(false); setVisible(false); setEntries([]) }
  const signature = JSON.stringify(pending.map(({ session }) => [session.id, catchUpVersion(session)]))
  useEffect(() => {
    if (!visible) return
    setEntries(mergePending)
    const next = { ...loadCatchUpSeen() }
    for (const [key, version] of Object.entries(seen)) next[key] = Math.max(next[key] ?? 0, version)
    for (const { session } of pending) {
      const key = readKey(session.projectId, session.threadId)
      next[key] = Math.max(next[key] ?? 0, catchUpVersion(session))
    }
    setSeen(next)
    try { localStorage.setItem(storageKey, JSON.stringify(next)); window.dispatchEvent(new Event('threaddeck:catch-up-seen')) } catch { /* optional navigation preference */ }
  }, [visible, signature])
  useEffect(() => {
    const sync = () => setSeen(loadCatchUpSeen())
    const storage = (event: StorageEvent) => { if (event.key === storageKey || event.key === null) sync() }
    window.addEventListener('storage', storage); window.addEventListener('threaddeck:catch-up-seen', sync)
    return () => { window.removeEventListener('storage', storage); window.removeEventListener('threaddeck:catch-up-seen', sync) }
  }, [])
  const currentEntries = entries.map(entry => {
    const project = projects.find(project => project.id === entry.project.id)
    const session = project?.sessions.find(session => session.id === entry.session.id)
    return session && project ? { session, project: { id: project.id, name: project.name } } : entry
  })
  return { visible, tabOpen, entries: currentEntries, unseenCount: unseen.length, open, close, leave: () => setVisible(false) }
}
