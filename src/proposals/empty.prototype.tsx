// THROWAWAY: five animated Hush-avatar activities in the existing proposal empty state.
// Same utility copy and actions; compare character behavior via ?variant=A/B/C/D/E.
// Fixture-only interactions, memory only, no fetches, schedules or real scans.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, ChevronRight, Clock3, Code2, GitBranch, Hash, Lightbulb, Menu, RefreshCw, SearchCheck, Settings2, ShieldCheck, Sparkles, SunMoon, X } from 'lucide-react'
import { BrandLogo } from '../components/brand-logo'
import { Button } from '../components/ui/button'
import { TooltipHint } from '../components/ui/tooltip'
import { SidebarSearch } from '../components/sidebar-search'
import { FilterTabGroup, type FilterTabOption } from '../components/filter-tabs'
import { mobileManagerStyle } from '../chat/mobile-style'
import { CharacterScene } from './empty-character.prototype'
import '../styles.css'
import '../chat/workspace.css'
import '../schedules/schedules.css'
import '../components/profile-controls.css'
import './empty.prototype.css'

const variants = ['A', 'B', 'C', 'D', 'E'] as const
type Variant = typeof variants[number]
type Scenario = 'first' | 'clear' | 'filtered' | 'scanning'
type Filter = 'Inbox' | 'All' | 'In progress' | 'Snoozed' | 'Done' | 'Dismissed'
const names = { A: 'Folder inspector', B: 'Inbox fishing', C: 'Zero paperwork', D: 'Coffee break', E: 'Bug patrol' }
const options: readonly FilterTabOption<Filter>[] = ['Inbox', 'All', 'In progress', 'Snoozed', 'Done', 'Dismissed'].map(value => ({ value: value as Filter, label: value }))
const projects = [{ name: 'ThreadDeck', description: 'Agent workspace & conversations' }, { name: 'TsCanvas', description: 'Canvas & timeline interactions' }, { name: 'BeautifulData', description: 'Data exploration & charts' }]
const focuses = ['Reliability', 'User experience', 'Performance', 'New features']
type StudyProps = { scenario: Scenario; selected: string[]; toggle: (name: string) => void; focus: string[]; toggleFocus: (name: string) => void; scan: () => void; explain: () => void; paused: boolean }
function Safety() { return <p className="empty-study-safety"><ShieldCheck size={13} />Scans create proposals, not code changes.</p> }
function Schedule({ clear = false }: { clear?: boolean }) { return <div className="empty-study-schedule"><Clock3 size={13} /><span>{clear ? 'Last review today, 09:00' : 'Daily discovery · 09:00 Buenos Aires'}</span><span className="schedule-dot" />{clear ? 'No new proposals' : 'Automatic review enabled'}</div> }
function ProjectSelection({ selected, toggle }: Pick<StudyProps, 'selected' | 'toggle'>) { return <div className="empty-study-projects">{projects.map(project => <label key={project.name}><input type="checkbox" checked={selected.includes(project.name)} onChange={() => toggle(project.name)} /><span className="project-check" aria-hidden="true">{selected.includes(project.name) && <Check size={12} />}</span><Hash size={16} /><span><strong>{project.name}</strong><small>{project.description}</small></span></label>)}</div> }

function CharacterEmpty({ variant, scenario, scan, explain, paused }: StudyProps & { variant: Variant }) {
  return <section className="character-empty"><CharacterScene variant={variant} paused={paused} /><h1>{scenario === 'clear' ? 'No new proposals' : 'No proposals yet'}</h1><p>{scenario === 'clear' ? 'The last scan did not add any proposals.' : 'Scan your projects to check for improvements and issues.'}</p><div className="empty-study-cta"><Button onClick={scan}><SearchCheck size={15} />Scan projects</Button><button onClick={explain}>Scan details <ArrowUpRight size={12} /></button></div><Safety /><Schedule clear={scenario === 'clear'} /></section>
}

function Prototype() {
  const params = new URLSearchParams(location.search)
  const initialVariant = params.get('variant')
  const [variant, setVariant] = useState<Variant>(variants.includes(initialVariant as Variant) ? initialVariant as Variant : 'A')
  const [paused, setPaused] = useState(false)
  const [scenario, setScenario] = useState<Scenario>('first')
  const [filter, setFilter] = useState<Filter>('Inbox'), [query, setQuery] = useState('')
  const [selected, setSelected] = useState(projects.map(p => p.name)), [focus, setFocus] = useState<string[]>([])
  const [modal, setModal] = useState<'scan' | 'explain' | null>(null)
  const [notice, setNotice] = useState('No scan requested.'), [drawer, setDrawer] = useState(false), [light, setLight] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null), search = useRef<HTMLInputElement>(null)
  const filtered = scenario === 'filtered' || Boolean(query) || filter !== 'Inbox' && filter !== 'All'
  useEffect(() => { document.documentElement.dataset.appearance = light ? 'light' : 'dark' }, [light])
  useLayoutEffect(() => { const panel = dialog.current, previous = document.activeElement; if (modal) panel?.showModal(); return () => { panel?.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus() } }, [modal])
  function choose(next: Variant) { setVariant(next); const url = new URL(location.href); url.searchParams.set('variant', next); history.replaceState(null, '', url) }
  function cycle(direction: number) { choose(variants[(variants.indexOf(variant) + direction + variants.length) % variants.length]) }
  useEffect(() => { const handler = (e: KeyboardEvent) => { if (modal || e.target instanceof HTMLElement && e.target.closest('input,textarea,select,[contenteditable]')) return; if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); cycle(e.key === 'ArrowLeft' ? -1 : 1) } }; window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler) }, [variant, modal])
  function toggle(name: string) { setSelected(previous => previous.includes(name) ? previous.filter(p => p !== name) : [...previous, name]) }
  function toggleFocus(name: string) { setFocus(previous => previous.includes(name) ? previous.filter(p => p !== name) : [...previous, name]) }
  function clearFilters() { setQuery(''); setFilter('Inbox'); setScenario('first') }
  const props: StudyProps = { scenario, selected, toggle, focus, toggleFocus, scan: () => setModal('scan'), explain: () => setModal('explain'), paused }
  const headline = scenario === 'scanning' ? 'Scan in progress' : filtered ? 'No matching proposals' : scenario === 'clear' ? 'No new proposals' : 'Proposals'
  return <div className="empty-state-study"><style>{mobileManagerStyle}</style><div className="empty-study-titlebar"><span><BrandLogo size={12} />ThreadDeck <small>LOCAL</small></span><b>EMPTY-STATE STUDY · SAMPLE WORKSPACE</b><span>−　□　×</span></div><div className="chat-workspace" style={{ '--chat-sidebar-width': '470px' } as CSSProperties}>
    {drawer && <button className="study-drawer-shade" aria-label="Close sidebar" onClick={() => setDrawer(false)} />}
    <aside className={`chat-manager study-sidebar ${drawer ? 'study-open' : ''}`} aria-label="Proposal sidebar"><div className="app-shell" data-design="classic"><header className="page-header"><div className="identity"><div className="brand-icon"><BrandLogo /></div><h1>ThreadDeck</h1></div><Button variant="ghost" size="icon" aria-label="Close sidebar" onClick={() => setDrawer(false)}><X size={17} /></Button></header><div className="schedules-tabs">{['Threads', 'Schedules', 'Proposals'].map(tab => <button key={tab} aria-pressed={tab === 'Proposals'} onClick={() => { if (tab !== 'Proposals') setNotice(`${tab} is outside this empty-state study.`) }}>{tab}</button>)}</div><div className="overview"><div className="overview-counts"><span className="overview-pill overview-pill-attention"><strong>0</strong>inbox</span><span className="overview-pill overview-pill-working"><strong>0</strong>in progress</span><span className="overview-pill overview-pill-projects"><strong>0</strong>projects</span></div><div className="sidebar-actions"><TooltipHint label="Refresh proposals"><Button variant="outline" size="icon" aria-label="Refresh proposals" onClick={() => setNotice('Fixture refreshed. No network request was made.')}><RefreshCw size={15} /></Button></TooltipHint></div></div><main><div className="toolbar"><SidebarSearch inputRef={search} query={query} setQuery={setQuery} placeholder="Search projects or proposals…" label="Search projects or proposals" hint="Filter proposals" /><div className="filter-toolbar"><FilterTabGroup filter={filter} setFilter={setFilter} filters={options} label="Filter proposals" /></div></div><div className="section-caption"><span>PROJECTS <span className="caption-count">00</span></span><span>0 PROPOSALS</span></div><div className="project-list study-sidebar-placeholder"><span><Lightbulb size={14} />{filtered ? 'No matches in this view.' : scenario === 'clear' ? 'No decisions waiting.' : scenario === 'scanning' ? 'Review in progress…' : 'Your next ideas will appear here.'}</span><small>{scenario === 'first' && !filtered ? 'Start a discovery review to fill this inbox.' : 'The main pane has your next step.'}</small></div></main><div className="study-sidebar-review"><Clock3 size={11} />{scenario === 'clear' ? 'Last review today · 09:00' : 'No discovery review yet'}</div><footer className="study-user-panel"><span className="study-avatar">S</span><span><strong>Local operator</strong><small>Sample workspace</small></span><button aria-label="Toggle appearance" onClick={() => setLight(!light)}><SunMoon size={17} /></button><button aria-label="Study information" onClick={() => setModal('explain')}><Settings2 size={17} /></button></footer></div></aside>
    <main className="chat-pane empty-study-pane"><header className="chat-pane-header"><Button variant="ghost" size="icon" className="study-open-sidebar" aria-label="Open sidebar" onClick={() => setDrawer(true)}><Menu size={17} /></Button><div><span className="chat-channel-name"><span className="channel-hash">#</span>Proposals</span><strong className="chat-thread-title">{headline}</strong></div><TooltipHint label="Refresh proposals"><Button variant="ghost" size="icon" aria-label="Refresh proposal pane" onClick={() => setNotice('Fixture refreshed. No network request was made.')}><RefreshCw size={15} /></Button></TooltipHint></header><div className="empty-study-stage">
      {scenario === 'scanning' ? <section className="character-empty"><CharacterScene variant={variant} paused={paused} /><h1>Scanning projects</h1><p>Checking {selected.length} projects. This is a simulation.</p><div className="empty-study-cta"><Button onClick={() => { setScenario('clear'); setNotice('Simulated scan completed. No real scan ran.') }}>Preview completed scan</Button></div></section> : filtered ? <section className="character-empty"><CharacterScene variant={variant} paused={paused} /><h1>No matching proposals</h1><p>Try a different search or clear the filters.</p><div className="empty-study-cta"><Button onClick={clearFilters}><ArrowLeft size={14} />Clear filters</Button></div></section> : <CharacterEmpty variant={variant} {...props} />}
    </div><div className="empty-study-state" role="status">{notice}<small>{variant} / {scenario} / {filter} · projects: {selected.join(', ') || 'none'} · focus: {focus.join(', ') || 'general'} · memory only</small></div></main></div>
    {import.meta.env.MODE !== 'production' && <div className="empty-study-switcher"><button aria-label="Previous design" onClick={() => cycle(-1)}><ArrowLeft size={15} /></button><span>DESIGN STUDY</span>{variants.map(v => <button key={v} className={variant === v ? 'active' : ''} onClick={() => choose(v)}>{v}<b>{names[v]}</b></button>)}<button aria-label="Next design" onClick={() => cycle(1)}><ArrowRight size={15} /></button><label><span>State</span><select aria-label="Preview state" value={scenario} onChange={e => { setScenario(e.target.value as Scenario); setQuery(''); setFilter('Inbox') }}><option value="first">No proposals yet</option><option value="clear">Inbox clear</option><option value="filtered">No matches</option><option value="scanning">Scanning</option></select></label><div className="character-study-motion"><button aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused ? 'Play' : 'Pause'} animations</button></div></div>}
    {modal && <dialog ref={dialog} className="empty-study-dialog" aria-labelledby="study-dialog-title" onCancel={() => setModal(null)}><header><div><span>SCAN / PREVIEW ONLY</span><h2 id="study-dialog-title">{modal === 'scan' ? 'Scan these projects?' : 'Scan details'}</h2></div><button aria-label="Close dialog" onClick={() => setModal(null)}><X size={18} /></button></header>{modal === 'scan' ? <><p>Scan recent changes, issues and existing proposals. Code is not changed.</p><ProjectSelection selected={selected} toggle={toggle} /><div className="study-demo-warning"><ShieldCheck size={15} />Simulation only. No agent will run.</div><footer><Button variant="outline" onClick={() => setModal(null)}>Cancel</Button><Button disabled={!selected.length} onClick={() => { setModal(null); setScenario('scanning'); setDrawer(false); setNotice('Scan simulation started. No project was read and no agent was launched.') }}><SearchCheck size={14} />Simulate scan</Button></footer></> : <><ol><li>Read recent changes, issues and active sessions.</li><li>Check evidence and deduplicate against existing proposals.</li><li>Add proposals to the inbox. Implementation requires approval.</li></ol><Schedule /><div className="study-demo-warning">Fixture data. No real scan is connected.</div></>}</dialog>}
  </div>
}
createRoot(document.getElementById('root')!).render(<Prototype />)
