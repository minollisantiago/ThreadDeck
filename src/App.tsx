import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, ChevronDown, ChevronRight, CircleAlert, Clock3, ExternalLink, Github, Layers2, Moon, Search, Sun, X } from 'lucide-react'
import { Button } from './components/ui/button'
import { Badge } from './components/ui/badge'
import { Input } from './components/ui/input'
import { useSnapshot } from './hooks/use-snapshot'
import { discordLinks, isActive, isAttention, type Project, type Session, type Snapshot } from '../shared/model'
import { projectOrder, relativeTime, visibleProjects, workingCount, type Filter } from './lib/view'

const palettes = ['pink', 'lavender', 'blue', 'green', 'peach'] as const
type Palette = typeof palettes[number]
function saved<T>(key: string, fallback: T, validate: (value: unknown) => value is T): T {
  try { const value: unknown = JSON.parse(localStorage.getItem(key) ?? 'null'); return validate(value) ? value : fallback } catch { return fallback }
}
function persist(key: string, value: unknown) { try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* preferences are optional */ } }
const labels = { working: 'Working', idle: 'Idle', error: 'Error', input: 'Input requested', permission: 'Permission needed' }

function SessionRow({ session, verified, now }: { session: Session; verified: boolean; now: number }) {
  const links = discordLinks(session)
  const status = verified ? session.status : 'unknown'
  return <div className="session-row">
    <div className="session-copy">
      {links ? <a className="session-title" href={links.app} title="Open thread in Discord app">{session.title}<ArrowUpRight aria-hidden="true" /></a>
        : <span className="session-title">{session.title}</span>}
      <div className="session-meta">
        <span title={new Date(session.updatedAt).toLocaleString()}>Updated {relativeTime(session.updatedAt, now)}</span>
        {verified && session.agentCount > 1 && <span> · {session.agentCount} agents</span>}
      </div>
    </div>
    <Badge className={`status status-${status}`}><span className="status-dot" />{status === 'unknown' ? 'Unknown' : labels[status]}</Badge>
    {links && <Button asChild variant="ghost" size="icon" className="browser-link"><a href={links.browser} target="_blank" rel="noreferrer" aria-label={`Open ${session.title} in browser`} title="Open in Discord browser"><ExternalLink /></a></Button>}
  </div>
}

function ProjectPanel({ project, collapsed, toggle, verified, now }: {
  project: Project; collapsed: boolean; toggle: () => void; verified: boolean; now: number
}) {
  const working = workingCount(project.sessions)
  const attention = project.sessions.filter(s => isAttention(s.status)).length
  const active = verified && project.sessions.some(isActive)
  return <section className={`project-panel ${active ? 'project-active' : ''}`} aria-labelledby={`heading-${project.id}`}>
    <button className="project-heading" id={`heading-${project.id}`} onClick={toggle} aria-expanded={!collapsed} aria-controls={`sessions-${project.id}`}>
      {collapsed ? <ChevronRight className="chevron" /> : <ChevronDown className="chevron" />}
      <span className="project-name">{project.name}</span>
      <span className="project-total">{project.sessions.length}</span>
      <span className="project-summary">
        {verified && working > 0 && <span className="working-summary"><i />{working} working</span>}
        {verified && attention > 0 && <span className="attention-summary">{attention} attention</span>}
        {(!verified || !active) && <span>{verified ? 'No working threads' : 'Status unavailable'}</span>}
      </span>
    </button>
    <div id={`sessions-${project.id}`} hidden={collapsed} className="project-sessions">
      {project.sessions.length ? project.sessions.map(session => <SessionRow key={session.id} session={session} verified={verified} now={now} />)
        : <p className="project-empty">No recent Discord sessions.</p>}
    </div>
  </section>
}

export function Dashboard({ snapshot, transportError = false, now = Date.now() }: { snapshot: Snapshot | null; transportError?: boolean; now?: number }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => saved('threaddeck:collapsed', {},
    (v): v is Record<string, boolean> => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.values(v).every(x => typeof x === 'boolean')))
  const [appearance, setAppearance] = useState<'dark' | 'light'>(() => saved('threaddeck:appearance',
    window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark', (v): v is 'light' | 'dark' => v === 'light' || v === 'dark'))
  const [palette, setPalette] = useState<Palette>(() => saved('threaddeck:palette', 'pink', (v): v is Palette => palettes.some(p => p === v)))
  const search = useRef<HTMLInputElement>(null)
  useEffect(() => { document.documentElement.dataset.appearance = appearance; persist('threaddeck:appearance', appearance) }, [appearance])
  useEffect(() => { document.documentElement.dataset.palette = palette; persist('threaddeck:palette', palette) }, [palette])
  useEffect(() => { persist('threaddeck:collapsed', collapsed) }, [collapsed])
  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      const target = event.target
      if (event.key === '/' && !(target instanceof HTMLElement && (target.matches('input,textarea,select') || target.isContentEditable))) {
        event.preventDefault(); search.current?.focus()
      }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [])
  const old = snapshot?.lastSuccessAt != null && now - snapshot.lastSuccessAt > 20_000
  const verified = !transportError && snapshot?.health === 'connected' && !old
  const loading = !transportError && (!snapshot || snapshot.lastSuccessAt === null && snapshot.checkedAt === 0)
  const projects = snapshot?.projects ?? []
  useEffect(() => {
    if (!snapshot || snapshot.lastSuccessAt === null) return
    setCollapsed(previous => {
      const next = { ...previous }
      let changed = false
      for (const project of snapshot.projects) if (!(project.id in next)) {
        next[project.id] = !project.sessions.some(isActive); changed = true
      }
      return changed ? next : previous
    })
  }, [snapshot])
  const sessions = projects.flatMap(p => p.sessions)
  const working = verified ? workingCount(sessions) : 0
  const attention = verified ? sessions.filter(s => isAttention(s.status)).length : 0
  const activeProjects = verified ? projects.filter(p => p.sessions.some(isActive)).length : 0
  const shown = projectOrder(visibleProjects(projects, query, filter, now, verified), verified)
  const narrowed = query.trim().length > 0 || filter !== 'all'
  const healthLabel = loading ? 'Connecting' : verified ? 'Connected' : snapshot?.lastSuccessAt ? 'Connection stale' : 'Disconnected'
  return <div className="app-shell">
    <header className="page-header">
      <div className="identity"><div className="brand-icon"><Layers2 aria-hidden="true" /></div><div><p className="eyebrow">YOUR AGENT SWITCHBOARD</p><h1>ThreadDeck<span className="live-label">LIVE</span></h1></div></div>
      <div className="appearance-controls">
        <div className="palette-picker" role="group" aria-label="Accent color">{palettes.map(p => <button key={p} className={`palette-swatch palette-${p}`} aria-label={`${p} accent`} title={`${p} accent`} aria-pressed={palette === p} onClick={() => setPalette(p)}>{palette === p ? '✓' : ''}</button>)}</div>
        <Button variant="outline" size="icon" aria-label={`Switch to ${appearance === 'dark' ? 'light' : 'dark'} mode`} onClick={() => setAppearance(appearance === 'dark' ? 'light' : 'dark')}>{appearance === 'dark' ? <Sun /> : <Moon />}</Button>
        <Button asChild variant="outline" size="icon"><a href="https://github.com/minollisantiago/ThreadDeck" target="_blank" rel="noopener noreferrer" aria-label="ThreadDeck on GitHub" title="View ThreadDeck on GitHub"><Github aria-hidden="true" /></a></Button>
      </div>
    </header>

    <div className="overview">
      <div className="overview-counts"><span><strong>{verified ? working : '—'}</strong> working</span><span><strong>{verified ? attention : '—'}</strong> need attention</span><span><strong>{verified ? activeProjects : '—'}</strong> active projects</span></div>
      <div className="connection" role="status"><span className={`connection-dot ${verified ? 'healthy' : loading ? '' : 'unhealthy'}`} /><span>{healthLabel}</span><span className="refresh-age">{snapshot?.lastSuccessAt != null ? `Updated ${relativeTime(snapshot.lastSuccessAt, now)}` : 'Waiting for first refresh'}</span></div>
    </div>

    <main>
      <div className="toolbar">
        <div className="search-field"><Search aria-hidden="true" /><Input ref={search} type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search projects or sessions…" aria-label="Search projects or sessions" onKeyDown={e => { if (e.key === 'Escape') { setQuery(''); search.current?.blur() } }} />{query ? <button className="clear-search" aria-label="Clear search" onClick={() => setQuery('')}><X /></button> : <kbd>/</kbd>}</div>
        <div className="filter-group" role="group" aria-label="Filter sessions">{([
          ['all', 'All sessions'], ['working', 'Working'], ['attention', 'Attention'], ['recent', 'Recent activity'],
        ] as const).map(([value, label]) => <Button key={value} variant="ghost" className={filter === value ? 'filter-selected' : ''} aria-pressed={filter === value} title={value === 'recent' ? 'Updated in the last 24 hours' : undefined} onClick={() => setFilter(value)}>{value === 'recent' && <Clock3 />}{label}</Button>)}</div>
      </div>

      {!verified && !loading && <div className="connection-notice" role="alert"><CircleAlert /><div><strong>Live status unavailable</strong><p>{snapshot?.lastSuccessAt ? 'Showing your last snapshot. Retrying automatically.' : 'Check that Kimaki and OpenCode are running. Retrying automatically.'}</p></div></div>}
      <div className="section-caption"><span>PROJECTS <span className="caption-count">{shown.length.toString().padStart(2, '0')}</span></span><span>{narrowed ? `${shown.reduce((count, p) => count + p.sessions.length, 0)} matching sessions` : 'Active projects first'}</span></div>
      <div className="project-list">
        {shown.map(project => {
          const defaultCollapsed = !verified || !project.sessions.some(isActive)
          const isCollapsed = collapsed[project.id] ?? (narrowed ? false : defaultCollapsed)
          return <ProjectPanel key={project.id} project={project} verified={verified} now={now} collapsed={isCollapsed} toggle={() => setCollapsed(previous => ({ ...previous, [project.id]: !isCollapsed }))} />
        })}
        {shown.length === 0 && <div className="empty-state"><Layers2 /><h2>{loading ? 'Finding your conversations…' : narrowed ? 'No matching sessions' : 'No projects to show yet'}</h2><p>{loading ? 'Connecting to Kimaki and OpenCode on this machine.' : narrowed ? 'Try another search or switch back to all sessions.' : 'Your registered Kimaki projects will appear here.'}</p>{narrowed && <Button variant="outline" onClick={() => { setQuery(''); setFilter('all') }}>Clear filters</Button>}</div>}
      </div>
    </main>
    <footer><span><span className="footer-dot" />LOCAL · READ ONLY</span><span>Titles open Discord app <ArrowUpRight /> <span className="footer-separator">/</span> <ExternalLink /> opens browser</span><span title="Recent inventory is bounded to the latest 300 OpenCode sessions. Working threads are checked separately.">Refreshes every 5s</span></footer>
  </div>
}

export default function App() {
  const { snapshot, transportError } = useSnapshot()
  const [now, setNow] = useState(Date.now)
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer) }, [])
  return <Dashboard snapshot={snapshot} transportError={transportError} now={now} />
}
