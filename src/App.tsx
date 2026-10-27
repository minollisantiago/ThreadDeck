import { useContext, useEffect, useRef, useState } from 'react'
import { ArrowUpRight, ChevronDown, CircleAlert, ExternalLink, Hash, Layers2, Plus, Search, SearchCode, X } from 'lucide-react'
import { TooltipHint } from './components/ui/tooltip'
import { Kbd, KbdGroup } from './components/ui/kbd'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { HeaderControls, palettes, type Palette } from './components/header-controls'
import { ConnectionIndicator } from './components/connection-indicator'
import { ConnectionNotice } from './components/connection-notice'
import { ThreadOptions } from './components/thread-options'
import { FilterTabs } from './components/filter-tabs'
import { ProjectUnreadPill } from './components/project-unread-pill'
import { ProjectCreateButton } from './components/project-create-button'
import { SessionRow } from './components/session-row'
import { ProjectIslands } from './components/project-islands'
import { ProjectCollapse } from './components/project-collapse'
import { StatePanels } from './components/state-panels'
import { isDesign, type Design } from './lib/design'
import { isDarkTheme, isLightTheme, type DarkTheme, type LightTheme } from './lib/theme'
import { useSnapshot } from './hooks/use-snapshot'
import { useChangeMotion } from './hooks/use-change-motion'
import { useUnread } from './hooks/use-unread'
import { DesktopTitlebar } from './components/desktop-titlebar'
import { ConversationSearch } from './components/conversation-search'
import { isActive, isAttention, type Project, type Session, type Snapshot } from '../shared/model'
import { snapshotStaleAfterMs } from '../shared/update-timing'
import { WorkspaceControls } from './chat/navigation'
import { ChatWorkspace } from './chat/workspace'
import { SidebarToggle } from './chat/sidebar-toggle'
import { isGrouping, projectOrder, sessionOrder, stateGroups, visibleProjects, workingCount, type Filter, type Grouping } from './lib/view'

function saved<T>(key: string, fallback: T, validate: (value: unknown) => value is T): T {
  try { const value: unknown = JSON.parse(localStorage.getItem(key) ?? 'null'); return validate(value) ? value : fallback } catch { return fallback }
}
function persist(key: string, value: unknown) { try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* preferences are optional */ } }

function ProjectPanel({ project, collapsed, toggle, verified, now, unread, markRead, markProjectRead }: {
  project: Project; collapsed: boolean; toggle: () => void; verified: boolean; now: number; unread: ReadonlySet<string>; markRead: (session: Session) => void; markProjectRead: (projectId: string) => void
}) {
  const working = workingCount(project.sessions)
  const attention = project.sessions.filter(s => isAttention(s.status)).length
  const unreadCount = project.sessions.filter(s => unread.has(s.id)).length
  const active = unreadCount > 0 || verified && project.sessions.some(isActive)
  return <section className={`project-panel ${active ? 'project-active' : ''}`} aria-labelledby={`heading-${project.id}`}>
    <div className="project-heading" data-connected={!collapsed && project.sessions.length > 0}>
      <TooltipHint label={project.name}><button className="project-toggle" type="button" onClick={toggle} aria-expanded={!collapsed} aria-controls={`sessions-${project.id}`}>
        <span className="sr-only">{project.name} {project.sessions.length} {project.sessions.length === 1 ? 'session' : 'sessions'}{verified && attention > 0 ? ` ${attention} ${attention === 1 ? 'needs' : 'need'} attention` : ''}{unreadCount > 0 ? ` ${unreadCount} unread` : ''}{verified && working > 0 ? ` ${working} working` : ''}{!verified ? ' Status unavailable' : !active ? ' No working threads' : ''}</span>
      </button></TooltipHint>
      <ChevronDown className={`chevron ${collapsed ? 'is-closed' : ''}`} aria-hidden="true" />
      <Hash className="project-channel-icon" aria-hidden="true" />
      <TooltipHint label={project.name}><span className="project-name" id={`heading-${project.id}`} aria-hidden="true">{project.name}</span></TooltipHint>
      <span className="project-pills">
        <span className="project-total" aria-hidden="true">{project.sessions.length} {project.sessions.length === 1 ? 'session' : 'sessions'}</span>
        {verified && attention > 0 && <span className="project-attention" aria-hidden="true"><CircleAlert aria-hidden="true" />{attention} {attention === 1 ? 'needs' : 'need'} attention</span>}
        <ProjectUnreadPill count={unreadCount} projectName={project.name} describedBy={`heading-${project.id}`} className="project-unread" markRead={() => markProjectRead(project.id)} />
        <ProjectCreateButton project={project} />
      </span>
      {(!verified || working > 0 || !active) && <span className="project-summary" aria-hidden="true">
        {verified && working > 0 && <span className="working-summary"><i />{working} working</span>}
        {(!verified || !active) && <span>{verified ? 'No working threads' : 'Status unavailable'}</span>}
      </span>}
    </div>
    <ProjectCollapse id={`sessions-${project.id}`} collapsed={collapsed}>
      <div className="project-sessions">
        {project.sessions.length ? sessionOrder(project.sessions, verified, unread).map(session => <SessionRow key={session.id} session={session} verified={verified} now={now} unread={unread.has(session.id)} markRead={markRead} />)
          : <p className="project-empty">No recent Discord sessions.</p>}
      </div>
    </ProjectCollapse>
  </section>
}

export function Dashboard({ snapshot, transportError = false, now = Date.now() }: { snapshot: Snapshot | null; transportError?: boolean; now?: number }) {
  const workspace = useContext(WorkspaceControls)
  const openFinder = () => workspace ? workspace.find() : setHistoryOpen(true)
  const [query, setQuery] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [filter, setFilter] = useState<Filter>('active')
  const [grouping, setGrouping] = useState<Grouping>(() => saved('threaddeck:grouping', 'project', isGrouping))
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => saved('threaddeck:collapsed', {},
    (v): v is Record<string, boolean> => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.values(v).every(x => typeof x === 'boolean')))
  const [appearance, setAppearance] = useState<'dark' | 'light'>(() => saved('threaddeck:appearance',
    window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark', (v): v is 'light' | 'dark' => v === 'light' || v === 'dark'))
  const [palette, setPalette] = useState<Palette>(() => saved('threaddeck:palette', 'pink', (v): v is Palette => palettes.some(p => p === v)))
  const [lightTheme, setLightTheme] = useState<LightTheme>(() => saved('threaddeck:light-theme', 'original', isLightTheme))
  const [darkTheme, setDarkTheme] = useState<DarkTheme>(() => saved('threaddeck:dark-theme', 'original', isDarkTheme))
  const [design, setDesign] = useState<Design>(() => saved('threaddeck:design', 'classic', isDesign))
  const [visualCollapsed, setVisualCollapsed] = useState<Record<string, boolean>>({})
  const search = useRef<HTMLInputElement>(null)
  const results = useRef<HTMLDivElement>(null)
  useChangeMotion(results, `${grouping}:${design}:${filter}`, 450)
  useEffect(() => { document.documentElement.dataset.appearance = appearance; persist('threaddeck:appearance', appearance) }, [appearance])
  useEffect(() => { document.documentElement.dataset.palette = palette; persist('threaddeck:palette', palette) }, [palette])
  useEffect(() => { document.documentElement.dataset.lightTheme = lightTheme; persist('threaddeck:light-theme', lightTheme) }, [lightTheme])
  useEffect(() => { document.documentElement.dataset.darkTheme = darkTheme; persist('threaddeck:dark-theme', darkTheme) }, [darkTheme])
  useEffect(() => { persist('threaddeck:collapsed', collapsed) }, [collapsed])
  useEffect(() => { persist('threaddeck:design', design) }, [design])
  useEffect(() => { persist('threaddeck:grouping', grouping) }, [grouping])
  useEffect(() => {
    let lastSpace = 0
    function keydown(event: KeyboardEvent) {
      const target = event.target
      const editable = target instanceof HTMLElement && (target.matches('input,textarea,select') || target.isContentEditable || Boolean(target.closest('[contenteditable="true"],dialog')))
      if (event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || editable) { lastSpace = 0; return }
      if (event.code === 'Space' || event.key === ' ') {
        // Preserve native Space activation on controls; only the page background owns this shortcut.
        if (target instanceof HTMLElement && target.closest('button,a,[role="button"],[role="menuitem"]')) { lastSpace = 0; return }
        event.preventDefault()
        const time = Date.now()
        if (lastSpace && time - lastSpace <= 350) { lastSpace = 0; openFinder() }
        else lastSpace = time
        return
      }
      lastSpace = 0
      if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.isComposing && !(target instanceof HTMLElement && (target.matches('input,textarea,select') || target.isContentEditable))) {
        event.preventDefault(); search.current?.focus()
      }
    }
    // Capture the shortcut before focused controls or page handlers swallow it.
    window.addEventListener('keydown', keydown, true)
    return () => window.removeEventListener('keydown', keydown, true)
  }, [])
  const old = snapshot?.lastSuccessAt != null && now - snapshot.lastSuccessAt > snapshotStaleAfterMs
  const verified = !transportError && snapshot?.health === 'connected' && !old
  const loading = !transportError && (!snapshot || snapshot.lastSuccessAt === null && snapshot.checkedAt === 0)
  const projects = snapshot?.projects ?? []
  const { unread, markRead, markAllRead, markProjectRead } = useUnread(projects)
  useEffect(() => {
    if (!snapshot || snapshot.lastSuccessAt === null) return
    setCollapsed(previous => {
      const next = { ...previous }
      let changed = false
      for (const project of snapshot.projects) if (!(project.id in next)) {
        next[project.id] = !project.sessions.some(s => isActive(s) || unread.has(s.id)); changed = true
      }
      return changed ? next : previous
    })
  }, [snapshot])
  const sessions = projects.flatMap(p => p.sessions)
  const working = verified ? workingCount(sessions) : 0
  const attention = verified ? sessions.filter(s => isAttention(s.status) || unread.has(s.id)).length : 0
  const activeProjects = verified ? projects.filter(p => p.sessions.some(s => isActive(s) || unread.has(s.id))).length : 0
  const shown = projectOrder(visibleProjects(projects, query, filter, now, verified, unread), verified, unread)
  const groups = stateGroups(shown, verified, unread)
  const narrowed = query.trim().length > 0 || filter !== 'all' && filter !== 'active'
  const healthLabel = loading ? 'Connecting' : verified ? 'Connected' : snapshot?.lastSuccessAt ? 'Connection stale' : 'Disconnected'
  return <>{!workspace && <DesktopTitlebar />}<div className="app-shell" data-design={design}>
    <header className="page-header">
      <div className="identity"><div className="brand-icon"><Layers2 aria-hidden="true" /></div><h1>ThreadDeck</h1></div>
      <HeaderControls compact={workspace?.compact} appearance={appearance} palette={palette} setAppearance={setAppearance} setPalette={setPalette} lightTheme={lightTheme} setLightTheme={setLightTheme} darkTheme={darkTheme} setDarkTheme={setDarkTheme} design={design} setDesign={setDesign} connection={<ConnectionIndicator snapshot={snapshot} verified={verified} loading={loading} healthLabel={healthLabel} transportError={transportError} />} />
      {workspace?.toggleSidebar && <SidebarToggle open={Boolean(workspace.sidebarOpen)} toggle={workspace.toggleSidebar} />}
    </header>

    <div className="overview">
      <div className="overview-counts">{[
        { kind: 'working', count: working, label: 'working', shortLabel: 'working' },
        { kind: 'attention', count: attention, label: 'need attention', shortLabel: 'attention' },
        { kind: 'projects', count: activeProjects, label: 'active projects', shortLabel: 'active' },
      ].map(({ kind, count, label, shortLabel }) => <span key={kind} className={`overview-pill overview-pill-${kind}`} data-count-state={!verified ? 'unknown' : count > 0 ? 'positive' : 'zero'}><strong>{verified ? count : '—'}</strong><span className="overview-label-full">{label}</span><span className="overview-label-short">{shortLabel}</span></span>)}</div>
    </div>

    <main>
      <div className="toolbar">
        <div className="search-field"><Search aria-hidden="true" /><Input ref={search} type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search projects or sessions…" aria-label="Search projects or sessions" aria-keyshortcuts="/" onKeyDown={e => { if (e.key === 'Escape') { setQuery(''); search.current?.blur() } }} />{query ? <button className="clear-search" aria-label="Clear search" onClick={() => setQuery('')}><X /></button> : <div className="search-shortcuts"><TooltipHint label={<>Filter projects or sessions <Kbd>/</Kbd> — outside text fields</>}><button type="button" aria-label="Search shortcuts" onClick={() => search.current?.focus()}><kbd>/</kbd></button></TooltipHint></div>}</div>
        <TooltipHint label={<>Advanced search — {workspace ? 'fuzzy session finder' : 'search chat logs'} {workspace && <><KbdGroup><Kbd>Ctrl</Kbd>+<Kbd>K</Kbd></KbdGroup> / </>}<Kbd>Double Space</Kbd></>}><Button variant="outline" size="icon" className="advanced-search" aria-label="Advanced search" aria-haspopup="dialog" onClick={openFinder}><SearchCode aria-hidden="true" /></Button></TooltipHint>
        <div className="filter-toolbar">
        <FilterTabs filter={filter} setFilter={setFilter} />
         {workspace?.create && <TooltipHint label={<>Start a new thread / OpenCode session <KbdGroup><Kbd>Ctrl</Kbd>+<Kbd>N</Kbd></KbdGroup> / <KbdGroup><Kbd>⌘</Kbd><Kbd>N</Kbd></KbdGroup></>}><Button variant="outline" size="icon" className="chat-create-thread" aria-label="New thread / OpenCode session" aria-keyshortcuts="Control+N Meta+N" onClick={() => workspace.create?.()}><Plus aria-hidden="true" /></Button></TooltipHint>}
        </div>
      </div>

      <ConnectionNotice visible={!verified && !loading} hasSnapshot={Boolean(snapshot?.lastSuccessAt)} />
      <div className="section-caption"><span>{grouping === 'project' ? 'PROJECTS' : 'STATES'} <span className="caption-count">{(grouping === 'project' ? shown.length : groups.length).toString().padStart(2, '0')}</span></span><ThreadOptions grouping={grouping} setGrouping={setGrouping} unreadCount={unread.size} markAllRead={markAllRead} /></div>
      <div className="project-list" ref={results}>
        {grouping === 'state' && <StatePanels groups={groups} verified={verified} now={now} unread={unread} markRead={markRead} graphical={design === 'islands'} />}
        {grouping === 'project' && design === 'islands' && shown.length > 0 && <ProjectIslands projects={shown} verified={verified} now={now} unread={unread} markRead={markRead} markProjectRead={markProjectRead} collapsed={visualCollapsed} toggle={key => setVisualCollapsed(previous => ({ ...previous, [key]: !previous[key] }))} />}
        {grouping === 'project' && design === 'classic' && shown.map(project => {
          const defaultCollapsed = !project.sessions.some(s => unread.has(s.id) || verified && isActive(s))
          const isCollapsed = collapsed[project.id] ?? (narrowed ? false : defaultCollapsed)
          return <ProjectPanel key={project.id} project={project} verified={verified} now={now} unread={unread} markRead={markRead} markProjectRead={markProjectRead} collapsed={isCollapsed} toggle={() => setCollapsed(previous => ({ ...previous, [project.id]: !isCollapsed }))} />
        })}
        {shown.length === 0 && <div className="empty-state"><Layers2 /><h2>{loading ? 'Finding your conversations…' : narrowed ? 'No matching sessions' : filter === 'active' && projects.length > 0 ? 'No active sessions' : 'No projects to show yet'}</h2><p>{loading ? 'Connecting to Kimaki and OpenCode on this machine.' : narrowed ? 'Try another search or switch back to all sessions.' : filter === 'active' && projects.length > 0 ? 'Idle sessions are hidden. Choose All sessions to see them.' : 'Your registered Kimaki projects will appear here.'}</p>{(narrowed || filter === 'active' && projects.length > 0) && <Button className="empty-state-action" onClick={() => { setQuery(''); setFilter('all') }}>{narrowed ? 'Clear filters' : 'Show all sessions'}</Button>}</div>}
      </div>
    </main>
    <footer>{!workspace && <span><span className="footer-dot" />LOCAL · READ ONLY</span>}<span>{workspace ? 'Titles open chat' : 'Titles open Discord app'} <ArrowUpRight /> <span className="footer-separator">/</span> <ExternalLink /> opens browser</span>{workspace && <ConnectionIndicator snapshot={snapshot} verified={verified} loading={loading} healthLabel={healthLabel} transportError={transportError} />}</footer>
  </div>{historyOpen && <ConversationSearch close={() => setHistoryOpen(false)} />}</>
}

export default function App() {
  const { snapshot, transportError } = useSnapshot()
  const [now, setNow] = useState(Date.now)
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer) }, [])
  return <ChatWorkspace snapshot={snapshot}><Dashboard snapshot={snapshot} transportError={transportError} now={now} /></ChatWorkspace>
}
