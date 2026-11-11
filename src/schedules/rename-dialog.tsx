import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Project } from '../../shared/model'
import { scheduleNameSchema, scheduleTitle, type Schedule } from '../../shared/schedules'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { ScheduleOperationNotice } from './pane'
import { useSchedulesContext } from './use-schedules'
import '../components/rename-session-dialog.css'

export function RenameScheduleDialog({ schedule, projects, close, restoreFocus }: { schedule: Schedule; projects: Project[]; close: () => void; restoreFocus: () => void }) {
  const workspace = useSchedulesContext()
  const dialog = useRef<HTMLDialogElement>(null), input = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(scheduleTitle(schedule).slice(0, 100)), [saving, setSaving] = useState(false), [error, setError] = useState('')
  const [submittedId, setSubmittedId] = useState<string | null>(null)
  const receipt = workspace.operation?.id === submittedId ? workspace.operation : null
  const pending = saving || Boolean(submittedId && (!receipt || ['accepted', 'running', 'unknown'].includes(receipt.state)))
  const writable = workspace.available && workspace.namesSupported && schedule.editable && !workspace.locked
  useLayoutEffect(() => {
    const panel = dialog.current
    panel?.showModal(); input.current?.select()
    return () => { panel?.close(); restoreFocus() }
  }, [])
  useEffect(() => {
    if (receipt?.state === 'succeeded') close()
    else if (receipt?.state === 'failed' || receipt?.state === 'unknown') setError(receipt.error || 'The rename could not be confirmed. Check its status before trying again.')
  }, [receipt, close])
  async function save() {
    if (pending || !writable) return
    const parsed = scheduleNameSchema.safeParse(name)
    if (!parsed.success) { setError('Use a single-line name of up to 100 characters.'); return }
    if (parsed.data === (schedule.name || '')) { close(); return }
    setSaving(true); setError('')
    try { await workspace.submit({ action: 'edit', id: schedule.id, revision: schedule.revision, changes: { name: parsed.data } }, setSubmittedId) }
    catch (error) { setError(error instanceof Error ? error.message : 'Could not rename the schedule') }
    finally { setSaving(false) }
  }
  return createPortal(<dialog ref={dialog} className="rename-session-dialog" aria-labelledby="rename-schedule-title" onCancel={event => { event.preventDefault(); if (!saving) close() }} onKeyDown={event => event.stopPropagation()}>
    <form onSubmit={event => { event.preventDefault(); void save() }}>
      <h2 id="rename-schedule-title">Rename schedule</h2>
      <p>Changes only the schedule’s display name, not its instruction. Leave blank to use the instruction as its title.</p>
      <label htmlFor="rename-schedule-name">Name</label>
      <Input ref={input} id="rename-schedule-name" value={name} maxLength={100} disabled={pending || !writable} onChange={event => setName(event.target.value)} aria-describedby={error ? 'rename-schedule-error' : undefined} aria-invalid={Boolean(error)} autoFocus />
      {error && <p id="rename-schedule-error" role="alert">{error}</p>}
      {submittedId && <ScheduleOperationNotice projects={projects} />}
      <div className="rename-session-actions"><Button type="button" variant="ghost" disabled={saving} onClick={close}>{pending ? 'Close' : 'Cancel'}</Button><Button type="submit" disabled={pending || !writable || !scheduleNameSchema.safeParse(name).success}>{pending ? 'Saving…' : 'Save'}</Button></div>
    </form>
  </dialog>, document.body)
}
