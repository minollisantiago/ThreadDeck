import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Clock3, Hash, Lightbulb, RefreshCw } from 'lucide-react'
import type { Project } from '../../shared/model'
import { proposalStatuses, type Proposal } from '../../shared/proposals'
import { FilterTabGroup, type FilterTabOption } from '../components/filter-tabs'
import { SidebarSearch } from '../components/sidebar-search'
import { ProjectCollapse } from '../components/project-collapse'
import { TooltipHint } from '../components/ui/tooltip'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { useProposalsContext, type ProposalFilter } from './use-proposals'
import './proposals.css'

const filters: readonly FilterTabOption<ProposalFilter>[] = [{ value: 'inbox', label: 'Inbox' }, { value: 'all', label: 'All' }, { value: 'progress', label: 'In progress' }, { value: 'snoozed', label: 'Snoozed' }, { value: 'done', label: 'Done' }, { value: 'dismissed', label: 'Dismissed' }]
export function ProposalBadge({ proposal }: { proposal: Proposal }) { return <Badge className={`proposal-status proposal-status-${proposal.status}`}><span className="status-dot" />{proposalStatuses[proposal.status]}</Badge> }
export function ProposalSidebar({ projects }: { projects: Project[] }) {
  const workspace = useProposalsContext()
  const search = useRef<HTMLInputElement>(null)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || document.querySelector('dialog[open], .profile-popup:popover-open')) return
      if (event.target instanceof HTMLElement && event.target.closest('input,textarea,select,[contenteditable]')) return
      event.preventDefault(); search.current?.focus()
    }
    window.addEventListener('keydown', key, true); return () => window.removeEventListener('keydown', key, true)
  }, [])
  const known = workspace.proposals.filter(p => projects.some(project => project.id === p.projectId))
  const searched = known.filter(p => `${p.title} ${p.summary} ${projects.find(project => project.id === p.projectId)?.name}`.toLowerCase().includes(workspace.query.toLowerCase()))
  const shown = searched.filter(p => workspace.filter === 'all' || p.status === workspace.filter)
  const groups = projects.filter(project => shown.some(p => p.projectId === project.id))
  function filter(value: ProposalFilter) { workspace.setFilter(value); const first = searched.find(p => value === 'all' || p.status === value); if (first) workspace.select(first.id) }
  return <><div className="overview"><div className="overview-counts"><span className="overview-pill overview-pill-attention"><strong>{workspace.loaded ? known.filter(p => p.status === 'inbox').length : '—'}</strong>inbox</span><span className="overview-pill overview-pill-working"><strong>{workspace.loaded ? known.filter(p => p.status === 'progress').length : '—'}</strong>in progress</span><span className="overview-pill overview-pill-projects"><strong>{workspace.loaded ? new Set(known.map(p => p.projectId)).size : '—'}</strong>projects</span></div><div className="sidebar-actions"><TooltipHint label="Refresh proposals"><Button variant="outline" size="icon" aria-label="Refresh proposals" disabled={workspace.loading || workspace.busy} onClick={() => void workspace.refresh()}><RefreshCw size={15} /></Button></TooltipHint></div></div>
    <main><div className="toolbar"><SidebarSearch inputRef={search} query={workspace.query} setQuery={workspace.setQuery} placeholder="Search projects or proposals…" label="Search projects or proposals" hint="Filter projects or proposals" /><div className="filter-toolbar"><FilterTabGroup filter={workspace.filter} setFilter={filter} filters={filters} label="Filter proposals" /></div></div>
    {workspace.error && <div className="proposals-error" role="alert">{workspace.error}{workspace.loaded && <span>Showing the last successful snapshot. Refresh before making changes.</span>}</div>}
    <div className="section-caption"><span>PROJECTS <span className="caption-count">{groups.length.toString().padStart(2, '0')}</span></span><span>{shown.length} PROPOSALS</span></div>
    <div className="project-list">{!workspace.loaded && workspace.loading ? <p className="project-empty" role="status">Loading proposals…</p> : groups.map(project => { const rows = shown.filter(p => p.projectId === project.id); const id = `proposal-project-${project.id}`; return <section className="project-panel" key={project.id}><div className="project-heading"><button type="button" className="project-toggle" aria-label={`Toggle proposals for ${project.name}`} aria-expanded={!collapsed[project.id]} aria-controls={id} onClick={() => setCollapsed(previous => ({ ...previous, [project.id]: !previous[project.id] }))} /><ChevronDown className={`chevron ${collapsed[project.id] ? 'is-closed' : ''}`} aria-hidden="true" /><Hash className="project-channel-icon" aria-hidden="true" /><span className="project-name">{project.name}</span><span className="project-pills"><span className="project-total">{rows.length} {rows.length === 1 ? 'proposal' : 'proposals'}</span></span></div><ProjectCollapse id={id} collapsed={Boolean(collapsed[project.id])}><div className="project-sessions">{rows.map(p => <div key={p.id} className="session-row proposal-tree-row" data-selected={workspace.selectedId === p.id}><div className="session-copy"><TooltipHint label={p.title}><button type="button" className="session-title" onClick={() => workspace.selectProposal(p.id)}>{p.title}</button></TooltipHint></div><div className="session-flags"><ProposalBadge proposal={p} /></div></div>)}</div></ProjectCollapse></section> })}
    {workspace.loaded && !shown.length && (workspace.query || workspace.filter !== 'inbox' ? <div className="empty-state"><Lightbulb /><h2>No matching proposals</h2><p>Try another search or filter.</p><Button className="empty-state-action" onClick={() => { workspace.setQuery(''); filter('inbox') }}>Back to inbox</Button></div> : <p className="project-empty">No proposals in this inbox.</p>)}</div></main>
    <div className="proposal-review-stamp"><Clock3 size={11} /><span>{workspace.reviewedAt === null ? 'No discovery review yet' : `Last review ${new Date(workspace.reviewedAt).toLocaleString()}`}</span></div></>
}
