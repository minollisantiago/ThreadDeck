// THROWAWAY: three stable activity placements on fixture project cards, ?variant=A/B/C.
// Real session rows, unread pills and create tooltips; no production layout changes or backend.
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Activity, ArrowLeft, ArrowRight, ArrowUp, ChevronDown, CircleHelp, Hash, Layers2, MoreHorizontal, Paperclip, Pause, Play, Plus, Search } from 'lucide-react'
import type { Project, Session } from '../../shared/model'
import { PinnedSessions } from '../hooks/use-pinned'
import { SelectedSession, SessionNavigation, WorkspaceControls } from '../chat/navigation'
import { ProjectCreateButton } from './project-create-button'
import { ProjectUnreadPill } from './project-unread-pill'
import { SessionRow } from './session-row'
import { TooltipHint, TooltipProvider } from './ui/tooltip'
import '../styles.css'
import '../chat/workspace.css'
import './activity-indicator.prototype.css'

const variants = ['A', 'B', 'C'] as const
type Variant = typeof variants[number]
const names = { A: 'Header activity pill', B: 'Channel icon signal', C: 'Always-present footer' }
const descriptions = {
  A: 'A compact green count joins the header pills. Its space stays reserved while idle.',
  B: 'The existing channel icon becomes the signal, with a tiny count. No new header column.',
  C: 'Activity lives in a permanent footer, not under the name. Extra height, but no state-driven shift.',
}
const now = Date.now()
const thread = (id: string, title: string, projectId: string): Session => ({ id, title, projectId, guildId: '100000000000000099', threadId: `1000000000000000${id.replace(/\D/g, '').padStart(2, '0')}`, status: 'idle', agentCount: 0, updatedAt: now - 120000 })
const fixtures: Project[] = [
  { id: 'deck', name: 'ThreadDeck', directory: '/fixture/threaddeck', sessions: [thread('s01', '### Ui changes, one change → one commit', 'deck'), thread('s02', 'Brainstorm and investigate a new ThreadDeck feature', 'deck'), thread('s03', 'it would be ideal if we could use the Windows tray', 'deck'), thread('s04', 'how to discover new projects to start sessions', 'deck'), thread('s05', 'new idea, connecting GitHub so the agent can review', 'deck'), thread('s06', 'Lets start with the UI tweaks on the new workspace', 'deck')] },
  { id: 'canvas', name: 'TSCanvas', directory: '/fixture/tscanvas', sessions: [thread('s07', 'take a look at the fuzzy finder we added', 'canvas'), thread('s08', 'Improve canvas repaint performance', 'canvas')] },
  { id: 'stirs', name: 'stirs', directory: '/fixture/stirs', sessions: [thread('s09', 'This is the first session for this project', 'stirs')] },
]

function ActivityMarker({ count, stale = false, icon = false }: { count: number; stale?: boolean; icon?: boolean }) {
  return <TooltipHint label={stale ? 'Working status unavailable — connection is stale' : count ? `${count} working ${count === 1 ? 'session' : 'sessions'}` : 'No working sessions'}><span className={icon ? 'study-channel-status' : 'study-activity-pill'} data-count={count} data-stale={stale} tabIndex={0} aria-label={stale ? 'Working status unavailable' : `${count} working sessions`}>{stale ? <CircleHelp size={16} /> : icon && !count ? <Hash size={18} /> : <Activity size={15} />}{!stale && (icon ? count > 0 && <b>{count}</b> : <><b>{count}</b><span>working</span></>)}</span></TooltipHint>
}
function ProjectCard({ project, variant, count, stale, collapsed, toggle, unread, markRead, markProjectRead }: {
  project: Project; variant: Variant; count: number; stale: boolean; collapsed: boolean; toggle: () => void; unread: ReadonlySet<string>; markRead: (session: Session) => void; markProjectRead: () => void
}) {
  const unreadCount = project.sessions.filter(session => unread.has(session.id)).length
  return <section className="project-panel study-project-card" data-project={project.id} data-working={count > 0}>
    <div className="project-heading" data-connected={!collapsed}>
      <button className="project-toggle" aria-expanded={!collapsed} aria-controls={`study-sessions-${project.id}`} onClick={toggle}><span className="sr-only">{project.name} · {project.sessions.length} sessions · {count} working</span></button>
      <ChevronDown className={`chevron ${collapsed ? 'is-closed' : ''}`} aria-hidden="true" />
      {variant === 'B' ? <ActivityMarker count={count} stale={stale} icon /> : <Hash className="project-channel-icon" aria-hidden="true" />}
      <TooltipHint label={project.name}><span className="project-name" id={`study-heading-${project.id}`}>{project.name}</span></TooltipHint>
      <span className="project-pills">{variant === 'A' && <ActivityMarker count={count} stale={stale} />}<span className="project-total study-session-total">{project.sessions.length} {project.sessions.length === 1 ? 'session' : 'sessions'}</span><ProjectUnreadPill count={unreadCount} projectName={project.name} describedBy={`study-heading-${project.id}`} markRead={markProjectRead} className="project-unread" /><ProjectCreateButton project={project} /></span>
    </div>
    {!collapsed && <div className="project-sessions" id={`study-sessions-${project.id}`}>{project.sessions.map(session => <SessionRow key={session.id} session={session} verified={!stale} now={now} unread={unread.has(session.id)} markRead={markRead} />)}</div>}
    {variant === 'C' && <div className="study-activity-footer" data-running={count > 0} data-stale={stale}><i />{stale ? 'Working status unavailable' : count ? `${count} ${count === 1 ? 'session' : 'sessions'} working` : 'No working sessions'}<span>{stale ? 'STALE' : count ? 'RUNNING' : 'IDLE'}</span></div>}
  </section>
}
function Prototype() {
  const params = new URLSearchParams(location.search)
  const [variant, setVariant] = useState<Variant>(variants.includes(params.get('variant') as Variant) ? params.get('variant') as Variant : 'A')
  const [running, setRunning] = useState(params.get('activity') !== 'idle'), [stale, setStale] = useState(params.get('activity') === 'stale')
  const [scenario, setScenario] = useState(params.get('case') || 'normal'), [theme, setTheme] = useState(params.get('theme') || 'dark'), [width, setWidth] = useState(params.get('width') || 'fit')
  const [selected, setSelected] = useState('s01'), [unread, setUnread] = useState(new Set(['s02', 's07', 's09'])), [pinned, setPinned] = useState(new Set(['s01', 's02', 's04', 's05']))
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ stirs: true }), [notice, setNotice] = useState('')
  const update = (key: string, value: string) => { const url = new URL(location.href); url.searchParams.set(key, value); history.replaceState(null, '', url); setNotice('') }
  const choose = (next: Variant) => { setVariant(next); update('variant', next) }
  const toggleActivity = () => { setStale(false); setRunning(!running); update('activity', running ? 'idle' : 'running') }
  useEffect(() => { document.documentElement.dataset.appearance = theme; console.info('Working indicator prototype', { variant, running, stale, scenario, width, theme, fixtureOnly: true }) }, [variant, running, stale, scenario, width, theme])
  useEffect(() => { const key = (event: KeyboardEvent) => { if ((event.target as HTMLElement).closest('input,textarea,select,[contenteditable]') || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return; event.preventDefault(); choose(variants[(variants.indexOf(variant) + (event.key === 'ArrowRight' ? 1 : 2)) % 3]) }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key) }, [variant])
  const counts = { deck: scenario === 'many' ? 3 : 1, canvas: scenario === 'many' ? 2 : 0, stirs: 0 }
  const projects = fixtures.map(project => ({ ...project, name: scenario === 'long' && project.id === 'deck' ? 'infrastructure-and-developer-experience' : project.name, sessions: project.sessions.map((session, index) => ({ ...session, status: running && !stale && index < counts[project.id as keyof typeof counts] ? 'working' as const : 'idle' as const, agentCount: running && !stale && index < counts[project.id as keyof typeof counts] ? 1 : 0 })) }))
  const markRead = (session: Session) => setUnread(previous => new Set([...previous].filter(id => id !== session.id)))
  const selectedSession = projects.flatMap(project => project.sessions).find(session => session.id === selected)!
  return <TooltipProvider delayDuration={150}><WorkspaceControls.Provider value={{ compact: true, find: () => setNotice('Fixture only: session finder.'), create: project => setNotice(`Fixture only: new session in ${project?.name || 'a project'}. Nothing is created.`), threadId: selectedSession.threadId }}><SelectedSession.Provider value={selected}><SessionNavigation.Provider value={session => setSelected(session.id)}><PinnedSessions.Provider value={{ pinned, togglePin: session => setPinned(previous => { const next = new Set(previous); next.has(session.id) ? next.delete(session.id) : next.add(session.id); return next }) }}>
    <div className="activity-prototype" data-variant={variant}>
      <header className="study-toolbar"><div><Layers2 size={17} /><b>Working indicator studies</b><small>FIXTURE ONLY</small></div><nav><button onClick={toggleActivity}>{running && !stale ? <Pause size={13} /> : <Play size={13} />}{running && !stale ? 'Pause all' : 'Start all'}</button><select aria-label="Scenario" value={scenario} onChange={event => { setScenario(event.target.value); update('case', event.target.value) }}><option value="normal">Normal names</option><option value="long">Long project name</option><option value="many">Multiple working sessions</option></select><select aria-label="Activity state" value={stale ? 'stale' : running ? 'running' : 'idle'} onChange={event => { setStale(event.target.value === 'stale'); setRunning(event.target.value === 'running'); update('activity', event.target.value) }}><option value="running">Working</option><option value="idle">Idle</option><option value="stale">Status unavailable</option></select><select aria-label="Viewport width" value={width} onChange={event => { setWidth(event.target.value); update('width', event.target.value) }}>{['fit', '320', '390', '430', '768', '1440', '1920'].map(value => <option key={value} value={value}>{value === 'fit' ? 'Fit screen' : `${value}px`}</option>)}</select><button onClick={() => { const value = theme === 'dark' ? 'light' : 'dark'; setTheme(value); update('theme', value) }}>{theme === 'dark' ? 'Light' : 'Dark'}</button></nav></header>
      <section className="study-intro"><h1>{variant} · {names[variant]}</h1><p>{descriptions[variant]}</p><small>Toggle Working ↔ Idle and watch the cards stay still. Unread badges now use the header counter’s accent.</small></section>
      <div className="study-device-scroll"><div className="study-device" style={width === 'fit' ? undefined : { width: Number(width) }}>
        <div className="study-titlebar"><Layers2 size={12} />ThreadDeck<span>PROJECT ACTIVITY STUDY</span></div>
        <div className="study-workspace"><aside className="study-manager"><div className="study-manager-header"><Layers2 size={21} /><strong>ThreadDeck</strong><MoreHorizontal size={17} /></div><div className="study-search"><Search size={14} /><input aria-label="Demo search" placeholder="Search projects or sessions…" /></div><div className="study-filters"><span className="selected">Active</span><span>All</span><span>Working</span><span>Attention</span><span>Recent</span></div><div className="study-caption">PROJECTS <b>03</b><span>FIXTURE DATA</span></div>
          <div className="project-list study-project-list">{projects.map(project => <ProjectCard key={project.id} project={project} variant={variant} count={running && !stale ? counts[project.id as keyof typeof counts] : 0} stale={stale} collapsed={Boolean(collapsed[project.id])} toggle={() => setCollapsed(previous => ({ ...previous, [project.id]: !previous[project.id] }))} unread={unread} markRead={markRead} markProjectRead={() => setUnread(previous => new Set([...previous].filter(id => !project.sessions.some(session => session.id === id))))} />)}</div>
          <footer className="study-manager-footer">Titles open chat<span><i />{stale ? 'Connection stale' : 'Connected'}</span></footer>
        </aside><main className="study-conversation"><header><Hash size={15} /><b>ThreadDeck</b><span>/</span><span>Ui changes</span></header><div><span className="study-agent">K</span><section><strong>Kimaki <small>Today · 12:10 PM</small></strong><h2>Keep activity out of the title’s second line.</h2><p>The project list on the left uses real thread rows, unread badges, and create-session tooltips.</p><p>Try a long project name, multiple working sessions, collapsed cards, and a stale connection.</p><div className="study-message-note"><Activity size={17} /><span>Only the project-level indicator is a mock. No production placement change has been made.</span></div></section></div><div className="study-composer"><textarea aria-label="Demo prompt" placeholder="Ask anything, / for commands, or attach files…" /><div><Paperclip size={16} /><span>gpt-6.1-sol · high</span><ArrowUp size={17} /></div></div></main></div>
      </div></div>
      {notice && <div className="study-notice" role="status">{notice}<button aria-label="Dismiss demo message" onClick={() => setNotice('')}>×</button></div>}
      {import.meta.env.MODE === 'prototype' && <div className="study-switcher"><button aria-label="Previous variant" onClick={() => choose(variants[(variants.indexOf(variant) + 2) % 3])}><ArrowLeft size={15} /></button><span><b>{variant}</b> {names[variant]}</span><button aria-label="Next variant" onClick={() => choose(variants[(variants.indexOf(variant) + 1) % 3])}><ArrowRight size={15} /></button><i /><button className="study-toggle-activity" onClick={toggleActivity}>{running && !stale ? 'Pause all' : 'Start all'}</button></div>}
    </div>
  </PinnedSessions.Provider></SessionNavigation.Provider></SelectedSession.Provider></WorkspaceControls.Provider></TooltipProvider>
}
createRoot(document.getElementById('root')!).render(<Prototype />)
