import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { chatFileSchema } from '../../shared/chat'
import { chatRequest, jsonRequest } from './api'

export const draftFileSchema = chatFileSchema.extend({ available: z.boolean().optional(), size: z.number().int().nonnegative().optional() })
const schema = z.object({ text: z.string(), anchor: z.number().int().nonnegative(), head: z.number().int().nonnegative(), revision: z.string(), files: z.array(draftFileSchema) })
export type Draft = z.infer<typeof schema>
const cache = new Map<string, Draft>()
const syncedOwners = new Set<string>()
let sync = Promise.resolve()
function syncDraft(owner: string) {
  const work = sync.then(() => chatRequest('files/drafts', z.object({ ok: z.boolean() }), jsonRequest({ owner, ids: stored(owner).files.map(file => file.id) })))
  sync = work.then(() => {}, () => {})
  return work
}
const empty = (): Draft => ({ text: '', anchor: 0, head: 0, revision: '', files: [] })
function stored(key: string) {
  try { const parsed = schema.safeParse(JSON.parse(localStorage.getItem(key) || 'null')); return parsed.success ? parsed.data : empty() } catch { return empty() }
}
export function useDraft(id: string) {
  const key = `threaddeck:chat-draft:v1:${id}`
  const [draft, setDraft] = useState<Draft>(() => cache.get(key) || { ...stored(key), files: stored(key).files.map(file => ({ ...file, available: false })) })
  const [conflict, setConflict] = useState(false), [storageError, setStorageError] = useState(false)
  const current = useRef(draft), revision = useRef(draft.revision)
  const persisted = useRef(true)
  current.current = draft
  function save(patch: Partial<Draft>, force = false) {
    const next = { ...current.current, ...patch }
    if (current.current.files.length || next.files.length) syncedOwners.add(key)
    if (!force && stored(key).revision !== revision.current) {
      persisted.current = false
      current.current = next; setDraft(next); cache.set(key, next); setConflict(true); return
    }
    next.revision = crypto.randomUUID()
    try { localStorage.setItem(key, JSON.stringify(next)); persisted.current = true; setStorageError(false) } catch { persisted.current = false; setStorageError(true) }
    revision.current = next.revision; current.current = next; cache.set(key, next); setDraft(next); setConflict(false)
  }
  function reload() { const next = stored(key); persisted.current = true; revision.current = next.revision; current.current = next; cache.set(key, next); setDraft(next); setConflict(false) }
  useEffect(() => {
    const changed = (event: StorageEvent) => { if (event.key === key || event.key === null) setConflict(stored(key).revision !== revision.current) }
    window.addEventListener('storage', changed); return () => window.removeEventListener('storage', changed)
  }, [key])
  useEffect(() => {
    if (stored(key).files.length) syncedOwners.add(key)
    if (!syncedOwners.has(key)) return
    let active = true
    const update = () => { if (persisted.current && !conflict) void syncDraft(key).catch(() => { if (active) setStorageError(true) }) }
    update()
    const timer = setInterval(update, 30_000)
    return () => { active = false; clearInterval(timer) }
  }, [key, draft.files, conflict])
  return { draft, owner: key, current, save, conflict, storageError, keep: () => save({}, true), reload }
}
