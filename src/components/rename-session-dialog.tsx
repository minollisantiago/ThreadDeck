import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Session } from '../../shared/model'
import { renameSessionSchema } from '../../shared/sessions'
import { Button } from './ui/button'
import { Input } from './ui/input'
import './rename-session-dialog.css'

export function RenameSessionDialog({ session, close }: { session: Session; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), input = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState(session.title), [saving, setSaving] = useState(false), [error, setError] = useState('')
  useLayoutEffect(() => {
    const panel = dialog.current
    panel?.showModal(); input.current?.select()
    return () => panel?.close()
  }, [])
  async function save() {
    if (saving) return
    const parsed = renameSessionSchema.safeParse({ title })
    if (!parsed.success) { setError('Enter a single-line name of 1–100 characters.'); return }
    setSaving(true); setError('')
    try {
      const response = await fetch(`/api/sessions/${encodeURIComponent(session.id)}/rename`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(parsed.data) })
      if (!response.ok) {
        const result = await response.json()
        throw new Error(result.error || 'Rename could not be confirmed. Check the current name before retrying.')
      }
      close()
    } catch (error) {
      setError(error instanceof Error && !(error instanceof TypeError) ? error.message : 'Rename could not be confirmed. The name may have changed; check it before retrying.')
      setSaving(false)
    }
  }
  return createPortal(<dialog ref={dialog} className="rename-session-dialog" aria-labelledby="rename-session-title" onCancel={event => { event.preventDefault(); if (!saving) close() }} onKeyDown={event => event.stopPropagation()}>
    <form onSubmit={event => { event.preventDefault(); void save() }}>
      <h2 id="rename-session-title">Rename conversation</h2>
      <p>Changes the session title and linked Discord thread name.</p>
      <label htmlFor="rename-session-name">Name</label>
      <Input ref={input} id="rename-session-name" value={title} disabled={saving} onChange={event => setTitle(event.target.value)} aria-describedby={error ? 'rename-session-error' : undefined} aria-invalid={Boolean(error)} autoFocus />
      {error && <p id="rename-session-error" role="alert">{error}</p>}
      <div className="rename-session-actions"><Button type="button" variant="ghost" disabled={saving} onClick={close}>Cancel</Button><Button type="submit" disabled={saving || !renameSessionSchema.safeParse({ title }).success}>{saving ? 'Saving…' : 'Save'}</Button></div>
    </form>
  </dialog>, document.body)
}
