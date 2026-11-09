import { useEffect, useRef, useState } from 'react'
import { AlertCircle, ChevronDown, Clock3, Hash, Plus, RefreshCw, Search } from 'lucide-react'
import type { Project } from '../../shared/model'
import { scheduleTitle } from '../../shared/schedules'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { ProjectCollapse } from '../components/project-collapse'
import { useSchedulesContext } from './use-schedules'
import './schedules.css'

export function ScheduleTabs() {
  const workspace = useSchedulesContext()
  return <div className="schedules-tabs" aria-label="Workspace section"><button type="button" aria-pressed={workspace.section === 'threads'} onClick={() => workspace.setSection('threads')}>Threads</button><button type="button" aria-pressed={workspace.section === 'schedules'} onClick={() => workspace.setSection('schedules')}>Schedules</button></div>
}
export function ScheduleSidebar({ projects }: { projects: Project[] }) {
  const workspace = useSchedulesContext()
  const [query, setQuery] = useState(''), [filter, setFilter] = useState('all')
  const search = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || document.querySelector('dialog[open], .profile-popup:popover-open')) return
      if (event.target instanceof HTMLElement && event.target.closest('input,textarea,select,[contenteditable]')) return
      event.preventDefault(); search.current?.focus()
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [])
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const tasks = workspace.tasks.filter(task => projects.some(project => project.id === task.projectId))
  const shown = tasks.filter(task => `${task.prompt || task.preview} ${projects.find(p => p.id === task.projectId)?.name || ''}`.toLowerCase().includes(query.toLowerCase()) && (filter === 'all' || task.kind === filter))
  const groups = projects.filter(project => !query || shown.some(task => task.projectId === project.id) || project.name.toLowerCase().includes(query.toLowerCase()))
  const disabled = !workspace.available || workspace.locked
  return <><div className="overview"><div className="overview-counts"><span className="overview-pill overview-pill-working"><strong>{workspace.checkedAt === null ? '—' : tasks.filter(t => t.status === 'planned').length}</strong>planned</span><span className="overview-pill overview-pill-attention"><strong>{workspace.checkedAt === null ? '—' : tasks.filter(t => t.lastError).length}</strong>errors</span></div><div className="sidebar-actions"><Button variant="outline" size="icon" aria-label="Refresh schedules" disabled={workspace.loading} onClick={() => void workspace.refresh()}><RefreshCw size={15} /></Button><Button variant="outline" size="icon" aria-label="New schedule" disabled={disabled || !projects.length} onClick={() => workspace.setEditor({ projectId: projects[0].id })}><Plus size={15} /></Button></div></div>
  <main><div className="toolbar"><div className="search-field"><Search aria-hidden="true" /><Input ref={search} aria-label="Search projects or schedules" aria-keyshortcuts="/" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search projects or schedules…" /></div><div className="filter-group">{[['all', 'All'], ['cron', 'Recurring'], ['at', 'One-time']].map(([value, label]) => <Button key={value} variant="ghost" className={filter === value ? 'filter-selected' : ''} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</Button>)}</div></div>
  {workspace.error && <div className="schedules-sidebar-error" role="alert">{workspace.error}{workspace.checkedAt !== null && <span>Showing the last successful snapshot. Changes are disabled.</span>}</div>}
  <div className="section-caption"><span>PROJECTS <span className="caption-count">{groups.length.toString().padStart(2, '0')}</span></span><span>SCHEDULES</span></div>
  <div className="project-list">{workspace.loading && workspace.checkedAt === null ? <p className="project-empty" role="status">Loading schedules…</p> : groups.map(project => {
    const rows = shown.filter(task => task.projectId === project.id)
    const id = `schedule-project-${project.id}`
    return <section className="project-panel" key={project.id}><div className="project-heading"><button type="button" className="project-toggle" aria-label={`Toggle schedules for ${project.name}`} aria-expanded={!collapsed[project.id]} aria-controls={id} onClick={() => setCollapsed(previous => ({ ...previous, [project.id]: !previous[project.id] }))} /><ChevronDown className={`chevron ${collapsed[project.id] ? 'is-closed' : ''}`} aria-hidden="true" /><Hash className="project-channel-icon" aria-hidden="true" /><span className="project-name">{project.name}</span><span className="project-pills"><span className="project-total">{rows.length} {rows.length === 1 ? 'schedule' : 'schedules'}</span><button type="button" className="schedule-project-add" disabled={disabled} aria-label={`Add schedule in ${project.name}`} onClick={() => workspace.setEditor({ projectId: project.id })}><Plus size={13} /></button></span></div>
    <ProjectCollapse id={id} collapsed={Boolean(collapsed[project.id])}><div className="project-sessions">{rows.map(task => <div key={task.id} className="session-row schedule-tree-row" data-selected={task.id === workspace.selectedId}><div className="session-copy"><button type="button" className="session-title" title={task.prompt || task.preview} onClick={() => workspace.selectTask(task.id)}>{scheduleTitle(task)}</button><span className="schedule-row-time"><Clock3 size={10} aria-hidden="true" />{task.status !== 'planned' ? task.status === 'running' ? 'Dispatching' : 'Failed · not scheduled' : new Date(task.nextRunAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC'}</span></div><span className={task.lastError ? 'schedule-row-error' : 'schedule-row-kind'} title={task.lastError || (task.kind === 'cron' ? 'Recurring' : 'One-time')}>{task.lastError ? <AlertCircle size={13} aria-label="Dispatch error" /> : <Clock3 size={12} aria-label={task.kind === 'cron' ? 'Recurring' : 'One-time'} />}</span></div>)}{!rows.length && <p className="project-empty">{query || filter !== 'all' ? 'No matching schedules.' : workspace.available ? 'No schedules yet.' : 'Schedules unavailable.'}</p>}</div></ProjectCollapse></section>
  })}{!groups.length && <p className="project-empty">{query ? 'No matching projects or schedules.' : 'Register a project to manage its schedules.'}</p>}</div></main></>
}
