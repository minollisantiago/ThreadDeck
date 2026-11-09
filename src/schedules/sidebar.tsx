import { useEffect, useRef, useState } from 'react'
import { AlertCircle, ChevronDown, Clock3, Hash, Plus, RefreshCw } from 'lucide-react'
import type { Project } from '../../shared/model'
import { scheduleTitle } from '../../shared/schedules'
import { Button } from '../components/ui/button'
import { SidebarSearch } from '../components/sidebar-search'
import { FilterTabGroup } from '../components/filter-tabs'
import { ProjectCollapse } from '../components/project-collapse'
import { useSchedulesContext } from './use-schedules'
import './schedules.css'

const filters = [{ value: 'all', label: 'All' }, { value: 'cron', label: 'Recurring' }, { value: 'at', label: 'One-time' }] as const

export function ScheduleTabs() {
  const workspace = useSchedulesContext()
  return <div className="schedules-tabs" aria-label="Workspace section"><button type="button" aria-pressed={workspace.section === 'threads'} onClick={() => workspace.setSection('threads')}>Threads</button><button type="button" aria-pressed={workspace.section === 'schedules'} onClick={() => workspace.setSection('schedules')}>Schedules</button></div>
}
export function ScheduleSidebar({ projects }: { projects: Project[] }) {
  const workspace = useSchedulesContext()
  const [query, setQuery] = useState(''), [filter, setFilter] = useState<'all' | 'cron' | 'at'>('all')
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
  const groups = projects.filter(project => shown.some(task => task.projectId === project.id))
  const emptyMessage = !projects.length ? 'Register a project to manage its schedules.' : !workspace.available ? 'Schedules unavailable.' : query || filter !== 'all' ? 'No matching schedules.' : 'No schedules yet. Use New schedule to add one.'
  const disabled = !workspace.available || workspace.locked
  return <><div className="overview"><div className="overview-counts"><span className="overview-pill overview-pill-working"><strong>{workspace.checkedAt === null ? '—' : tasks.filter(t => t.status === 'planned').length}</strong>planned</span><span className="overview-pill overview-pill-attention"><strong>{workspace.checkedAt === null ? '—' : tasks.filter(t => t.lastError).length}</strong>errors</span></div><div className="sidebar-actions"><Button variant="outline" size="icon" aria-label="Refresh schedules" disabled={workspace.loading} onClick={() => void workspace.refresh()}><RefreshCw size={15} /></Button><Button variant="outline" size="icon" aria-label="New schedule" disabled={disabled || !projects.length} onClick={() => workspace.setEditor({ projectId: projects[0].id })}><Plus size={15} /></Button></div></div>
  <main><div className="toolbar"><SidebarSearch inputRef={search} query={query} setQuery={setQuery} placeholder="Search projects or schedules…" label="Search projects or schedules" hint="Filter projects or schedules" /><div className="filter-toolbar"><FilterTabGroup filter={filter} setFilter={setFilter} filters={filters} label="Filter schedules" /></div></div>
  {workspace.error && <div className="schedules-sidebar-error" role="alert">{workspace.error}{workspace.checkedAt !== null && <span>Showing the last successful snapshot. Changes are disabled.</span>}</div>}
  <div className="section-caption"><span>PROJECTS <span className="caption-count">{groups.length.toString().padStart(2, '0')}</span></span><span>SCHEDULES</span></div>
  <div className="project-list">{workspace.loading && workspace.checkedAt === null ? <p className="project-empty" role="status">Loading schedules…</p> : groups.map(project => {
    const rows = shown.filter(task => task.projectId === project.id)
    const id = `schedule-project-${project.id}`
    return <section className="project-panel" key={project.id}><div className="project-heading"><button type="button" className="project-toggle" aria-label={`Toggle schedules for ${project.name}`} aria-expanded={!collapsed[project.id]} aria-controls={id} onClick={() => setCollapsed(previous => ({ ...previous, [project.id]: !previous[project.id] }))} /><ChevronDown className={`chevron ${collapsed[project.id] ? 'is-closed' : ''}`} aria-hidden="true" /><Hash className="project-channel-icon" aria-hidden="true" /><span className="project-name">{project.name}</span><span className="project-pills"><span className="project-total">{rows.length} {rows.length === 1 ? 'schedule' : 'schedules'}</span><button type="button" className="schedule-project-add" disabled={disabled} aria-label={`Add schedule in ${project.name}`} onClick={() => workspace.setEditor({ projectId: project.id })}><Plus size={13} /></button></span></div>
    <ProjectCollapse id={id} collapsed={Boolean(collapsed[project.id])}><div className="project-sessions">{rows.map(task => <div key={task.id} className="session-row schedule-tree-row" data-selected={task.id === workspace.selectedId}><div className="session-copy"><button type="button" className="session-title" title={task.prompt || task.preview} onClick={() => workspace.selectTask(task.id)}>{scheduleTitle(task)}</button><span className="schedule-row-time"><Clock3 size={10} aria-hidden="true" />{task.status !== 'planned' ? task.status === 'running' ? 'Dispatching' : 'Failed · not scheduled' : new Date(task.nextRunAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC'}</span></div><span className={task.lastError ? 'schedule-row-error' : 'schedule-row-kind'} title={task.lastError || (task.kind === 'cron' ? 'Recurring' : 'One-time')}>{task.lastError ? <AlertCircle size={13} aria-label="Dispatch error" /> : <Clock3 size={12} aria-label={task.kind === 'cron' ? 'Recurring' : 'One-time'} />}</span></div>)}{!rows.length && <p className="project-empty">{query || filter !== 'all' ? 'No matching schedules.' : workspace.available ? 'No schedules yet.' : 'Schedules unavailable.'}</p>}</div></ProjectCollapse></section>
  })}{!groups.length && !(workspace.loading && workspace.checkedAt === null) && <p className="project-empty">{emptyMessage}</p>}</div></main></>
}
