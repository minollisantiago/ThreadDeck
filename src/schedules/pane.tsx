import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { AlertCircle, Clock3, Hash, Play, RefreshCw, Trash2, X } from 'lucide-react'
import type { Project } from '../../shared/model'
import { scheduleTitle, type Schedule } from '../../shared/schedules'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { SidebarToggle } from '../chat/sidebar-toggle'
import { useSchedulesContext, type ScheduleEditorTarget } from './use-schedules'
import './schedules.css'

function date(value: string, timezone = 'UTC') {
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime())) return 'Time unavailable'
  try { return `${parsed.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: timezone })} ${timezone}` }
  catch { return `${parsed.toISOString()} (invalid stored timezone)` }
}
function Dialog({ title, children, close, busy = false }: { title: string; children: ReactNode; close: () => void; busy?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useLayoutEffect(() => {
    const previous = document.activeElement, panel = dialog.current
    panel?.showModal()
    return () => { panel?.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus() }
  }, [])
  return <dialog ref={dialog} className="schedule-dialog" aria-label={title} onCancel={event => { event.preventDefault(); if (!busy) close() }}><header><h2>{title}</h2><Button type="button" variant="ghost" size="icon" disabled={busy} aria-label={`Close ${title.toLowerCase()}`} onClick={close}><X size={17} /></Button></header>{children}</dialog>
}
export function ScheduleOperationNotice() {
  const workspace = useSchedulesContext(), operation = workspace.operation
  if (!workspace.operationId) return null
  const pending = operation?.state === 'accepted' || operation?.state === 'running'
  const uncertain = !operation || operation.state === 'unknown' || Boolean(workspace.operationError)
  return <section className="schedule-operation" aria-label="Schedule operation status" role="status"><strong>{pending ? 'Schedule operation in progress' : operation?.state === 'succeeded' ? operation.result?.ran === false ? 'Occurrence not dispatched' : 'Schedule operation confirmed' : operation?.state === 'failed' ? 'Schedule operation rejected' : 'Schedule outcome unknown'}</strong>
    {operation?.result?.ran === false && <p>{operation.result.reason}</p>}
    {operation?.action === 'run' && operation.result?.ran && <p>Dispatched to Kimaki. This does not mean the AI turn has finished.</p>}
    {operation?.error && <p>{operation.error}</p>}{workspace.operationError && <p>{workspace.operationError}</p>}
    {pending && <p>You can leave this pane. Do not repeat the operation; status is checked automatically.</p>}
    <small>Operation {workspace.operationId}</small><div><Button variant="outline" onClick={() => void workspace.checkOperation(workspace.operationId!)}>Check operation status</Button>{(!pending || workspace.operationError) && <Button variant="ghost" onClick={() => { if (!uncertain || window.confirm('Only continue if you have inspected schedules and Discord. A previous operation may still complete. Dismissing does not cancel it.')) workspace.dismissOperation() }}>{uncertain ? 'I have checked the outcome' : 'Dismiss result'}</Button>}</div>
  </section>
}
export function SchedulePane({ projects, sidebar, sidebarOpen }: { projects: Project[]; sidebar: () => void; sidebarOpen: boolean }) {
  const workspace = useSchedulesContext()
  const [confirmation, setConfirmation] = useState<{ action: 'run' | 'delete'; schedule: Schedule } | null>(null)
  const [submitting, setSubmitting] = useState(false), [error, setError] = useState('')
  const [confirmationOperation, setConfirmationOperation] = useState<string | null>(null)
  useEffect(() => { if (confirmationOperation && workspace.operation?.id === confirmationOperation && workspace.operation.state === 'succeeded') setConfirmation(null) }, [confirmationOperation, workspace.operation])
  const task = workspace.tasks.find(t => t.id === workspace.selectedId)
  const transcript = useRef<HTMLDivElement>(null)
  useEffect(() => { if (transcript.current) transcript.current.scrollTop = 0 }, [task?.id])
  const project = projects.find(p => p.id === task?.projectId)
  const writable = workspace.available && !workspace.locked
  async function perform() {
    if (!confirmation || submitting) return
    setSubmitting(true); setError('')
    try { await workspace.submit({ action: confirmation.action, id: confirmation.schedule.id, revision: confirmation.schedule.revision }, setConfirmationOperation); setConfirmation(null) }
    catch (error) { setError(error instanceof Error ? error.message : 'Operation could not be confirmed') }
    finally { setSubmitting(false) }
  }
  return <main className="chat-pane schedule-pane"><header className="chat-pane-header">{!sidebarOpen && <SidebarToggle open={false} toggle={sidebar} className="schedule-mobile-navigation" />}<div><span className="chat-channel-name"><span className="channel-hash">#</span>{project?.name || 'Schedules'}</span><strong>{task ? scheduleTitle(task) : 'Project schedules'}</strong></div><Button variant="ghost" size="icon" aria-label="Refresh schedules" disabled={workspace.loading} onClick={() => void workspace.refresh()}><RefreshCw size={15} /></Button></header>
  <div ref={transcript} className="chat-transcript schedule-document"><div className="schedule-page"><ScheduleOperationNotice />{workspace.error && <div className="schedule-alert" role="alert"><AlertCircle size={17} /><div><strong>Schedules unavailable</strong><p>{workspace.error}</p>{workspace.checkedAt !== null && <p>Last successful refresh: {new Date(workspace.checkedAt).toLocaleTimeString()}. Displayed data may be stale; changes are disabled.</p>}</div></div>}
  {task ? <><div className="schedule-kicker"><Clock3 size={14} />SCHEDULE <span>#{task.id}</span><span className={`schedule-status schedule-status-${task.status}`}>{task.status === 'running' ? 'Dispatching' : task.status === 'failed' ? 'Failed' : 'Planned'}</span></div><h2>{scheduleTitle(task)}</h2>
    <section className="schedule-next"><div><span className="schedule-label">{task.status === 'planned' ? 'NEXT PLANNED RUN' : task.status === 'running' ? 'OCCURRENCE BEING DISPATCHED' : 'NO FUTURE RUN PLANNED'}</span><strong>{task.status === 'failed' ? 'Failed one-time schedule' : date(task.nextRunAt, task.timezone)}</strong><small>{task.kind === 'at' ? 'One-time' : `Recurring · ${task.expression}`} · {task.timezone}</small>{task.timezone !== Intl.DateTimeFormat().resolvedOptions().timeZone && task.status === 'planned' && <small>Your local time: {new Date(task.nextRunAt).toLocaleString()}</small>}</div><Clock3 size={30} strokeWidth={1} /></section>
    <div className="schedule-section-heading"><h3>Instruction</h3><span>Full saved prompt</span></div><div className="schedule-instruction">{task.prompt ?? 'The stored payload could not be decoded. The preview is not safe to edit.'}</div>
    <section className="schedule-settings"><h3>Configuration</h3><dl><dt>Project / channel</dt><dd><Hash size={12} />{project?.name || task.projectId}</dd><dt>Destination</dt><dd>{task.threadId ? `Continue thread ${task.threadId}` : task.notifyOnly ? 'Channel notification only' : 'New conversation each run'}</dd><dt>Schedule</dt><dd><code>{task.expression}</code><span className="schedule-zone">{task.timezone}</span></dd><dt>Agent / model</dt><dd>{task.agent || 'Default'} / {task.model || 'project default'}</dd><dt>Overlap policy</dt><dd>{task.allowConcurrency ? 'Allow concurrent sessions' : task.kind === 'at' ? 'Wait while the previous session is busy' : 'Skip if the previous session is busy'}</dd></dl></section>
    {task.preRun && <section className="schedule-prerun"><h3>Pre-run shell command</h3><pre>{task.preRun}</pre><p>This existing command runs on the Kimaki machine before dispatch, including Run now. It cannot be edited here.</p></section>}
    {task.lastError && <div className="schedule-alert"><AlertCircle size={17} /><div><strong>Dispatch error</strong><p>{task.lastError}</p></div></div>}
    <section className="schedule-actions-section" aria-labelledby="schedule-actions-heading"><h3 id="schedule-actions-heading">Actions</h3><div className="schedule-actions"><Button disabled={!writable || !task.editable} onClick={() => { setError(''); setConfirmation({ action: 'run', schedule: task }) }}><Play size={13} />Run now</Button><Button variant="outline" disabled={!writable || !task.editable} onClick={() => workspace.setEditor({ projectId: task.projectId, schedule: task })}>Edit schedule</Button><Button variant="outline" className="schedule-delete" disabled={!writable} onClick={() => { setError(''); setConfirmation({ action: 'delete', schedule: task }) }}><Trash2 size={13} />Delete schedule…</Button></div>
    <p className="schedule-note">{task.kind === 'at' ? 'Run now consumes this one-time occurrence. A pre-run skip can also remove it.' : 'Run now dispatches an occurrence and advances its next planned time.'} Dispatch is not AI completion. Deleting a routine does not stop an already dispatched session.</p></section>
  </> : <div className="schedule-empty"><Clock3 size={32} /><h2>{workspace.loading ? 'Loading schedules…' : workspace.available ? 'No schedules yet' : 'Project schedules'}</h2><p>{workspace.available ? 'Use New schedule in the sidebar to create a routine for any registered project.' : 'Connect the updated local Kimaki bridge to load and manage routines.'}</p><Button variant="outline" onClick={sidebar}>Open schedules sidebar</Button></div>}</div></div>
  {confirmation && <Dialog title={confirmation.action === 'run' ? 'Run this schedule now?' : 'Delete this schedule?'} close={() => setConfirmation(null)} busy={submitting}><div className="schedule-dialog-body"><p><strong>{scheduleTitle(confirmation.schedule)}</strong></p><p>{confirmation.action === 'run' ? `${confirmation.schedule.kind === 'at' ? 'This consumes the one-time occurrence.' : 'This advances its next planned run.'} ${confirmation.schedule.preRun ? 'Its configured shell pre-run command will execute too. ' : ''}The operation does not wait for the AI turn to complete.` : 'This permanently removes the routine, but does not stop an AI session or shell command already underway.'}</p>{error && <p role="alert" className="schedule-form-error">{error}</p>}</div><footer><Button variant="outline" disabled={submitting} onClick={() => setConfirmation(null)}>Cancel</Button><Button className={confirmation.action === 'delete' ? 'schedule-delete' : undefined} disabled={submitting || workspace.locked} onClick={() => void perform()}>{submitting ? 'Submitting…' : confirmation.action === 'run' ? 'Run now' : 'Delete schedule'}</Button></footer></Dialog>}
  </main>
}
function ScheduleEditor({ target, projects }: { target: ScheduleEditorTarget; projects: Project[] }) {
  const workspace = useSchedulesContext(), original = target.schedule
  const [projectId, setProjectId] = useState(target.projectId)
  const [prompt, setPrompt] = useState(original?.prompt || ''), [sendAt, setSendAt] = useState(original?.expression || '0 12 * * 1')
  const [agent, setAgent] = useState(original?.agent || ''), [model, setModel] = useState(original?.model || ''), [overlap, setOverlap] = useState(original?.allowConcurrency || false)
  const [error, setError] = useState(''), [submitting, setSubmitting] = useState(false), [submittedId, setSubmittedId] = useState<string | null>(null)
  const initial = JSON.stringify([target.projectId, original?.prompt || '', original?.expression || '0 12 * * 1', original?.agent || '', original?.model || '', original?.allowConcurrency || false])
  const dirty = JSON.stringify([projectId, prompt, sendAt, agent, model, overlap]) !== initial
  const busy = submitting || Boolean(submittedId && workspace.operation?.id === submittedId && ['accepted', 'running'].includes(workspace.operation.state))
  useEffect(() => {
    if (!submittedId || workspace.operation?.id !== submittedId) return
    if (workspace.operation.state === 'succeeded') { if (workspace.operation.result) workspace.selectTask(workspace.operation.result.routineId); workspace.setEditor(null) }
    else if (workspace.operation.state === 'failed' || workspace.operation.state === 'unknown') setError(workspace.operation.error || 'The operation could not be confirmed')
  }, [submittedId, workspace.operation, workspace.setEditor, workspace.selectTask])
  const close = () => { if (!dirty || window.confirm('Discard unsaved schedule changes?')) workspace.setEditor(null) }
  async function save(event: FormEvent) {
    event.preventDefault(); if (busy) return
    setSubmitting(true); setError('')
    try {
      const changes = { ...(prompt !== original?.prompt && { prompt }), ...(sendAt !== original?.expression && { sendAt }), ...(agent !== (original?.agent || '') && { agent }), ...(model !== (original?.model || '') && { model }), ...(overlap !== original?.allowConcurrency && { allowConcurrency: overlap }) }
      if (original && !Object.keys(changes).length) { workspace.setEditor(null); return }
      const receipt = await workspace.submit(original ? { action: 'edit', id: original.id, revision: original.revision, changes } : { action: 'create', projectId, prompt, sendAt, agent, model, allowConcurrency: overlap }, setSubmittedId)
      setSubmittedId(receipt.id)
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not save the schedule') }
    finally { setSubmitting(false) }
  }
  return <Dialog title={original ? 'Edit schedule' : 'New project schedule'} close={close} busy={submitting}><form onSubmit={save}><div className="schedule-dialog-body"><p className="schedule-editor-project"># {projects.find(p => p.id === projectId)?.name || projectId}{original && ` / routine ${original.id}`}</p>
    {!original && <label>Project<select value={projectId} onChange={event => setProjectId(event.target.value)} disabled={busy}>{projects.map(project => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label>}
    <label>Instruction<textarea aria-label="Instruction" autoFocus required maxLength={128 * 1024} value={prompt} onChange={event => setPrompt(event.target.value)} disabled={busy} /></label>
    {!original && <label>Schedule preset<select aria-label="Schedule preset" value={['0 12 * * 1', '0 12 * * *', '0 12 * * 1-5'].includes(sendAt) ? sendAt : 'custom'} onChange={event => setSendAt(event.target.value === 'custom' ? '' : event.target.value)} disabled={busy}><option value="0 12 * * 1">Mondays at 12:00 UTC</option><option value="0 12 * * *">Every day at 12:00 UTC</option><option value="0 12 * * 1-5">Weekdays at 12:00 UTC</option><option value="custom">Custom / one-time</option></select></label>}
    <label>Schedule · UTC<Input aria-label="Schedule" required value={sendAt} maxLength={200} onChange={event => setSendAt(event.target.value)} disabled={busy} /><small>Cron expression, or a future UTC ISO timestamp ending in Z (e.g. 2027-01-15T09:00:00Z). Validated by Kimaki.</small></label>
    {original?.timezone !== 'UTC' && original && <p className="schedule-form-error">Current timezone: {original.timezone}. Leaving the expression unchanged preserves it. Changing the schedule resets it to UTC.</p>}
    <div className="schedule-editor-columns"><label>Agent<Input aria-label="Agent" value={agent} onChange={event => setAgent(event.target.value)} disabled={busy} placeholder="Default" /></label><label>Model<Input aria-label="Model" value={model} onChange={event => setModel(event.target.value)} disabled={busy} placeholder="provider/model (optional)" /></label></div>
    <label>When the previous session is still busy<select value={String(overlap)} onChange={event => setOverlap(event.target.value === 'true')} disabled={busy}><option value="false">Do not overlap (cron skips; one-time waits)</option><option value="true">Allow concurrent sessions</option></select></label>
    {original?.preRun && <p className="schedule-note">The existing pre-run shell command is preserved. It is not executed by saving.</p>}
    {error && <p role="alert" className="schedule-form-error">{error}</p>}{submittedId && <ScheduleOperationNotice />}
    <p className="schedule-note">New schedules start a conversation in this project. Existing destinations and advanced options are preserved on edit. Saving does not run the task.</p></div><footer><Button type="button" variant="outline" disabled={submitting} onClick={close}>{busy ? 'Close' : 'Cancel'}</Button><Button type="submit" disabled={busy || workspace.locked || !workspace.available}>{busy ? 'Saving…' : original ? 'Save changes' : 'Create schedule'}</Button></footer></form></Dialog>
}
export function ScheduleDialogs({ projects }: { projects: Project[] }) {
  const workspace = useSchedulesContext()
  return workspace.editor ? <ScheduleEditor target={workspace.editor} projects={projects} /> : null
}
