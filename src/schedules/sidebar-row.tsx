import { useCallback, useRef, useState } from 'react'
import { AlertCircle, Clock3, Pencil, Play } from 'lucide-react'
import type { Project } from '../../shared/model'
import { scheduleTitle, type Schedule } from '../../shared/schedules'
import { SidebarContextMenu } from '../components/session-context-menu'
import { TooltipHint } from '../components/ui/tooltip'
import { RenameScheduleDialog } from './rename-dialog'
import { useSchedulesContext } from './use-schedules'

export function ScheduleSidebarRow({ task, projects }: { task: Schedule; projects: Project[] }) {
  const workspace = useSchedulesContext()
  const row = useRef<HTMLDivElement>(null)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  // Retain the original revision while editing, so refreshes cannot silently
  // overwrite a concurrent rename with a stale draft.
  const [renaming, setRenaming] = useState<Schedule | null>(null)
  const closeMenu = useCallback((restoreFocus = false) => { setMenu(null); if (restoreFocus) row.current?.focus() }, [])
  const closeRename = useCallback(() => setRenaming(null), [])
  const restoreFocus = useCallback(() => row.current?.focus(), [])
  const disabled = !workspace.available || workspace.locked || !workspace.namesSupported || !task.editable
  const reason = !workspace.namesSupported ? 'Renaming requires the updated local Kimaki bridge' : !workspace.available ? 'Refresh schedules successfully before renaming' : workspace.locked ? 'Check the current schedule operation before renaming' : !task.editable ? 'Only planned, readable schedules can be renamed' : undefined
  return <div ref={row} tabIndex={0} aria-haspopup="menu" className="session-row schedule-tree-row" data-selected={task.id === workspace.selectedId} onContextMenu={event => {
    event.preventDefault(); event.stopPropagation(); setMenu({ x: event.clientX, y: event.clientY })
  }} onKeyDown={event => {
    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
      event.preventDefault(); event.stopPropagation()
      const rect = event.currentTarget.getBoundingClientRect()
      setMenu({ x: rect.left, y: rect.bottom })
    }
  }}>
    <div className="session-copy"><button type="button" className="session-title" title={task.prompt || task.preview} onClick={() => workspace.selectTask(task.id)}>{scheduleTitle(task)}</button><span className="schedule-row-time"><Clock3 size={10} aria-hidden="true" />{task.status !== 'planned' ? task.status === 'running' ? 'Dispatching' : 'Failed · not scheduled' : <time dateTime={task.nextRunAt}>{new Date(task.nextRunAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}</time>}</span></div><span className={task.lastError ? 'schedule-row-error' : 'schedule-row-kind'} title={task.lastError || (task.kind === 'cron' ? 'Recurring' : 'One-time')}>{task.lastError ? <AlertCircle size={13} aria-label="Dispatch error" /> : <Clock3 size={12} aria-label={task.kind === 'cron' ? 'Recurring' : 'One-time'} />}</span>
    <TooltipHint label="Run schedule now"><button type="button" className="schedule-row-run" aria-label={`Run ${scheduleTitle(task)} now`} disabled={!workspace.available || workspace.locked || !task.editable} onClick={() => { workspace.selectTask(task.id); workspace.setConfirmation({ action: 'run', schedule: task }) }}><Play size={13} aria-hidden="true" /></button></TooltipHint>
    {menu && <SidebarContextMenu {...menu} close={closeMenu} label="Schedule actions"><button role="menuitem" aria-disabled={disabled} title={reason} onClick={() => { if (!disabled) { closeMenu(); setRenaming(task) } }}><Pencil aria-hidden="true" />Rename…</button></SidebarContextMenu>}
    {renaming && <RenameScheduleDialog schedule={renaming} projects={projects} close={closeRename} restoreFocus={restoreFocus} />}
  </div>
}
