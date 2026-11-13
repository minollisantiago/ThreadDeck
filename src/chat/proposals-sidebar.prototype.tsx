// THROWAWAY: refine the user's chosen direction, not another set of alternatives.
// Question: can proposals reuse the existing top tabs, project tree, filters and right pane?
// Production styles and UI primitives; fixture-only, in-memory actions, no network calls.
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowLeft, ArrowUpRight, Check, ChevronDown, Clock3, FileCode2, Hash, Layers2, Lightbulb, Menu, MessageSquare, Play, ShieldCheck, SunMoon, X } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { SidebarSearch } from '../components/sidebar-search'
import { FilterTabGroup, type FilterTabOption } from '../components/filter-tabs'
import { ProjectCollapse } from '../components/project-collapse'
import { TooltipHint } from '../components/ui/tooltip'
import { mobileManagerStyle } from './mobile-style'
import '../styles.css'
import './workspace.css'
import '../schedules/schedules.css'
import './proposals-sidebar.prototype.css'

type Status = 'Inbox' | 'In progress' | 'Snoozed' | 'Done' | 'Dismissed'
type Filter = Status | 'All'
type Section = 'Threads' | 'Schedules' | 'Proposals'
type Proposal = { id: string; project: string; title: string; status: Status; kind: 'Observed opportunity' | 'New idea'; effort: string; summary: string; reason: string; evidence: string[]; prompt: string; reviewed: string; session?: string; until?: string }
const fixtures: Proposal[] = [
  { id: 'drafts', project: 'ThreadDeck', title: 'Keep drafts through reconnects', status: 'Inbox', kind: 'Observed opportunity', effort: 'Small', summary: 'A dropped connection should not cost an unfinished prompt.', reason: 'Trace the draft lifecycle during reconnects and session switches. Confirm whether any recovery gap exists before proposing a change.', evidence: ['src/chat/pane.tsx', 'src/chat/drafts.ts'], prompt: 'Investigate draft recovery during reconnects and session switches. Trace the existing draft lifecycle and delivery guards before changing anything. If a recovery gap exists, propose the smallest fix and regression coverage. Preserve unsent work and do not automatically resend an uncertain submission.', reviewed: 'New today' },
  { id: 'finder', project: 'ThreadDeck', title: 'Measure large-history search latency', status: 'Inbox', kind: 'Observed opportunity', effort: 'Medium', summary: 'Keep finding conversations effortless as the history grows.', reason: 'Measure the session finder against a large synthetic history. Only optimize if the baseline shows a meaningful delay.', evidence: ['shared/search.ts', 'src/chat/workspace.tsx'], prompt: 'Measure session finder latency with a large synthetic history. Inspect shared/search.ts and src/chat/workspace.tsx. Report a baseline and propose an optimization only if it is justified by the measurements.', reviewed: 'Updated today' },
  { id: 'canvas', project: 'TsCanvas', title: 'Resume the last canvas', status: 'Inbox', kind: 'New idea', effort: 'Explore first', summary: 'A quiet “continue working” entry point instead of starting from the project list.', reason: 'Explore whether restoring the last canvas removes repeated navigation. Agree on what should be restored before building persistence.', evidence: ['Product exploration · no verified requirement'], prompt: 'Explore a continue-working entry point for the most recent canvas. Inspect current navigation, identify which state is useful to restore, and present an interaction proposal before implementing it.', reviewed: 'New today' },
  { id: 'charts', project: 'BeautifulData', title: 'Explain why a chart is empty', status: 'Inbox', kind: 'Observed opportunity', effort: 'Small', summary: 'Tell apart no data, loading, and filters that hide every result.', reason: 'Audit existing empty-state messaging first. Suggest contextual guidance only where the next step is unclear.', evidence: ['Proposed chart-state audit · illustrative'], prompt: 'Audit chart empty states. Distinguish no data, loading, and filters excluding all rows. Confirm existing behavior, then propose the smallest contextual guidance improvement.', reviewed: 'Revisited today' },
  { id: 'tooltips', project: 'ThreadDeck', title: 'Unify watchlist shortcut tooltips', status: 'In progress', kind: 'Observed opportunity', effort: 'Small', summary: 'Use consistent shortcut labels across the watchlist.', reason: 'A linked session is already investigating this proposal. Open that conversation instead of starting duplicate work.', evidence: ['Sample linked session · not a real finding'], prompt: 'Review shortcut labels and propose consistent tooltip wording.', reviewed: 'Started yesterday', session: 'Unify watchlist shortcut tooltips' },
  { id: 'export', project: 'TsCanvas', title: 'Explore a shareable canvas snapshot', status: 'Snoozed', kind: 'New idea', effort: 'Medium', summary: 'A read-only snapshot for sharing work without editor access.', reason: 'Revisit after the canvas navigation work settles.', evidence: ['Product exploration · illustrative'], prompt: 'Explore read-only canvas snapshots. Plan first; do not build sharing infrastructure without approval.', reviewed: 'Snoozed yesterday', until: 'Tomorrow' },
  { id: 'labels', project: 'BeautifulData', title: 'Clarify chart annotation labels', status: 'Done', kind: 'Observed opportunity', effort: 'Small', summary: 'Completed work stays traceable rather than disappearing from the inbox.', reason: 'Sample completed proposal with a linked outcome. In production, completion must be confirmed, not inferred from an idle agent.', evidence: ['Sample outcome · fixture only'], prompt: 'Review chart annotation labels.', reviewed: 'Completed yesterday', session: 'Chart annotation labels' },
  { id: 'rewrite', project: 'BeautifulData', title: 'Replace the chart renderer', status: 'Dismissed', kind: 'New idea', effort: 'Large', summary: 'Dismissed: not enough benefit to justify a broad rewrite.', reason: 'Remember this decision. Do not regenerate the same proposal unless there is materially new evidence.', evidence: ['Decision · scope too broad'], prompt: 'Evaluate whether a renderer replacement has a concrete benefit.', reviewed: 'Dismissed yesterday' },
]
const projects = ['ThreadDeck', 'TsCanvas', 'BeautifulData']
const filters: readonly FilterTabOption<Filter>[] = ['Inbox', 'All', 'In progress', 'Snoozed', 'Done', 'Dismissed'].map(value => ({ value: value as Filter, label: value }))
const statusClass = (status: Status) => status === 'In progress' ? 'progress' : status.toLowerCase()
const fixtureThreads = ['Proposal inbox explorations', 'Unify watchlist shortcut tooltips']

function Prototype() {
  const params = new URLSearchParams(location.search)
  const initialFilter = filters.some(f => f.value === params.get('filter')) ? params.get('filter') as Filter : 'Inbox'
  const [proposals, setProposals] = useState(fixtures)
  const [section, setSection] = useState<Section>('Proposals')
  const [filter, setFilter] = useState<Filter>(initialFilter)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(fixtures.find(p => initialFilter === 'All' || p.status === initialFilter)?.id || 'drafts')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [light, setLight] = useState(false)
  const [drawer, setDrawer] = useState(false)
  const [editing, setEditing] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [approach, setApproach] = useState('Plan first')
  const [sessionView, setSessionView] = useState(false)
  const [notice, setNotice] = useState('All content is illustrative. No projects scanned or sessions launched.')
  const search = useRef<HTMLInputElement>(null)
  const mobileSearch = useRef<HTMLInputElement>(null)
  const drawerRef = useRef<HTMLDialogElement>(null)
  const editor = useRef<HTMLDialogElement>(null)
  const proposal = proposals.find(p => p.id === selected)!
  const matches = (p: Proposal, f = filter) => (f === 'All' || p.status === f) && `${p.project} ${p.title} ${p.summary}`.toLowerCase().includes(query.toLowerCase())
  const visible = proposals.filter(p => matches(p))
  const groups = projects.filter(project => visible.some(p => p.project === project))
  const width = params.get('width') === '565' ? 565 : 430
  useEffect(() => { document.documentElement.dataset.appearance = light ? 'light' : 'dark' }, [light])
  useEffect(() => { if (drawer) drawerRef.current?.showModal(); else drawerRef.current?.close() }, [drawer])
  useEffect(() => { if (editing) editor.current?.showModal(); else editor.current?.close() }, [editing])
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || e.repeat || e.isComposing || editing) return
      if (e.target instanceof HTMLElement && e.target.closest('input,textarea,select,[contenteditable]')) return
      if (section !== 'Proposals') return
      e.preventDefault(); (drawer ? mobileSearch : search).current?.focus()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [drawer, editing, section])
  function changeFilter(next: Filter) {
    setFilter(next)
    const url = new URL(location.href); url.searchParams.set('filter', next); history.replaceState(null, '', url)
    const first = proposals.find(p => matches(p, next)); if (first) setSelected(first.id)
    setSessionView(false)
  }
  function select(id: string) { setSelected(id); setDrawer(false); setSessionView(false) }
  function update(status: Status) {
    setProposals(previous => previous.map(p => p.id === selected ? { ...p, status, until: status === 'Snoozed' ? 'Tomorrow' : undefined } : p))
    setNotice(`${proposal.title}: ${status}${status === 'Snoozed' ? ' until tomorrow' : ''}. In-memory demo only.`)
  }
  function start() { setPrompt(proposal.prompt); setApproach('Plan first'); setEditing(true) }
  function simulateStart() {
    if (!prompt.trim()) return
    setProposals(previous => previous.map(p => p.id === selected ? { ...p, status: 'In progress', session: p.title, prompt } : p))
    setNotice(`Simulated session created with your edited prompt · ${approach}. No actual agent started.`)
    setEditing(false)
    setFilter('In progress')
    const url = new URL(location.href); url.searchParams.set('filter', 'In progress'); history.replaceState(null, '', url)
    setSection('Threads')
    setSessionView(true)
  }
  function sidebar(mobile = false) {
    return <aside className="chat-manager" aria-label={mobile ? 'Mobile proposal sidebar' : 'Proposal sidebar'}><div className="app-shell" data-design="classic">
      <header className="page-header"><div className="identity"><div className="brand-icon"><Layers2 /></div><h1>ThreadDeck</h1></div><Button variant="ghost" size="icon" aria-label="Toggle appearance" onClick={() => setLight(!light)}><SunMoon size={16} /></Button><Button variant="ghost" size="icon" className="proposal-drawer-close" aria-label="Close project drawer" onClick={() => setDrawer(false)}><X size={16} /></Button></header>
      <div className="schedules-tabs" aria-label="Workspace section">{(['Threads', 'Schedules', 'Proposals'] as Section[]).map(name => <button key={name} type="button" aria-pressed={section === name} onClick={() => { setSection(name); setSessionView(name === 'Threads' && Boolean(proposal.session)) }}>{name}</button>)}</div>
      {section === 'Proposals' ? <>
        <div className="overview"><div className="overview-counts"><span className="overview-pill overview-pill-attention"><strong>{proposals.filter(p => p.status === 'Inbox').length}</strong>inbox</span><span className="overview-pill overview-pill-working"><strong>{proposals.filter(p => p.status === 'In progress').length}</strong>in progress</span><span className="overview-pill overview-pill-projects"><strong>{projects.length}</strong>projects</span></div></div>
        <main><div className="toolbar"><SidebarSearch inputRef={mobile ? mobileSearch : search} query={query} setQuery={setQuery} placeholder="Search projects or proposals…" label="Search projects or proposals" hint="Filter projects or proposals" /><div className="filter-toolbar"><FilterTabGroup filter={filter} setFilter={changeFilter} filters={filters} label="Filter proposals" /></div></div>
          <div className="section-caption"><span>PROJECTS <span className="caption-count">{groups.length.toString().padStart(2, '0')}</span></span><span className="proposal-sidebar-label">{visible.length} {visible.length === 1 ? 'PROPOSAL' : 'PROPOSALS'}</span></div>
          <div className="project-list">{groups.map(project => { const rows = visible.filter(p => p.project === project); const id = `proposal-${mobile ? 'mobile' : 'desktop'}-${project}`; return <section className="project-panel" key={project}><div className="project-heading"><button className="project-toggle" aria-label={`Toggle ${project} proposals`} aria-expanded={!collapsed[project]} aria-controls={id} onClick={() => setCollapsed(previous => ({ ...previous, [project]: !previous[project] }))} /><ChevronDown className={`chevron ${collapsed[project] ? 'is-closed' : ''}`} aria-hidden="true" /><Hash className="project-channel-icon" aria-hidden="true" /><span className="project-name">{project}</span><span className="project-pills"><span className="project-total">{rows.length} {rows.length === 1 ? 'proposal' : 'proposals'}</span></span></div><ProjectCollapse id={id} collapsed={Boolean(collapsed[project])}><div className="project-sessions">{rows.map(p => <div className="session-row proposal-tree-row" data-selected={selected === p.id} key={p.id}><div className="session-copy"><TooltipHint label={p.title}><button className="session-title" onClick={() => select(p.id)}>{p.title}</button></TooltipHint></div><div className="session-flags"><Badge className={`proposal-status proposal-status-${statusClass(p.status)}`}><span className="status-dot" />{p.status}</Badge></div></div>)}</div></ProjectCollapse></section> })}{!groups.length && <div className="empty-state"><Lightbulb /><h2>No matching proposals</h2><p>{query ? 'Try a different search.' : `No proposals in ${filter.toLowerCase()}.`}</p><Button variant="outline" onClick={() => { setQuery(''); changeFilter('Inbox') }}>Back to inbox</Button></div>}</div>
        </main>
        <div className="proposal-review-stamp"><Clock3 size={11} />Last review today · 08:30 <span>Sample</span></div>
      </> : <main className="proposal-other-tab"><div className="section-caption"><span>PROJECTS</span></div><section className="project-panel"><div className="project-heading"><ChevronDown className="chevron" /><Hash className="project-channel-icon" /><span className="project-name">ThreadDeck</span></div><div className="project-sessions">{(section === 'Threads' ? [...new Set([...fixtureThreads, ...(proposal.session ? [proposal.session] : [])])] : ['Daily proposal review']).map(title => <div className="session-row" key={title}><div className="session-copy"><button className="session-title" onClick={() => { setDrawer(false); setSessionView(section === 'Threads') }}>{title}</button></div><Badge className="status status-idle">{section === 'Threads' ? 'Idle' : 'Daily'}</Badge></div>)}</div></section><p>Navigation preview. Switch to Proposals to review the mock.</p></main>}
      <footer><span>LOCAL · INTERACTIVE MOCK</span><span className="proposal-profile">S</span></footer>
    </div></aside>
  }
  return <div className="proposal-sidebar-study"><style>{mobileManagerStyle}</style><div className="proposal-study-titlebar"><span><Layers2 size={12} />ThreadDeck</span><b>PROPOSAL SIDEBAR STUDY · SAMPLE DATA</b><span>−　□　×</span></div><div className="chat-workspace" style={{ '--chat-sidebar-width': `${width}px` } as CSSProperties}>
    <div className="proposal-desktop-manager">{sidebar()}</div>
    <main className="chat-pane proposal-pane"><header className="chat-pane-header"><Button variant="ghost" size="icon" className="proposal-open-projects" aria-label="Open project sidebar" onClick={() => setDrawer(true)}><Menu size={17} /></Button><div><span className="chat-channel-name"><span className="channel-hash">#</span>{proposal.project}</span><strong className="chat-thread-title">{section === 'Schedules' ? 'Daily proposal review' : proposal.title}</strong></div><span className="proposal-pane-kind">{section === 'Proposals' ? 'PROPOSAL' : section === 'Schedules' ? 'SCHEDULE PREVIEW' : 'SESSION PREVIEW'}</span></header>
      <div className="chat-transcript proposal-document">{section === 'Proposals' ? <article className="proposal-page"><div className="proposal-kicker"><Lightbulb size={14} />PROPOSAL <span>{proposal.reviewed}</span><Badge className={`proposal-status proposal-status-${statusClass(proposal.status)}`}>{proposal.status}</Badge></div><h2>{proposal.title}</h2><p className="proposal-lede">{proposal.summary}</p>
        <div className="proposal-facts"><div><span>KIND</span><strong className={proposal.kind === 'New idea' ? 'proposal-speculative' : ''}>{proposal.kind}</strong></div><div><span>EFFORT</span><strong>{proposal.effort}</strong></div><div><span>PROJECT / CHANNEL</span><strong># {proposal.project}</strong></div></div>
        {proposal.status === 'Snoozed' && <div className="proposal-state-note"><Clock3 size={15} /><span>Snoozed until {proposal.until?.toLowerCase()}. It will return to the inbox then.</span></div>}
        {proposal.status === 'Dismissed' && <div className="proposal-state-note"><X size={15} /><span>Dismissed. The routine should remember this decision.</span></div>}
        {proposal.status === 'Done' && <div className="proposal-state-note"><Check size={15} /><span>Completed · illustrative outcome, not a verified change.</span></div>}
        <h3>Why consider this?</h3><p className="proposal-body-text">{proposal.reason}</p><div className="proposal-section-heading"><h3>Starting points</h3><span>Illustrative, not verified findings</span></div><div className="proposal-evidence">{proposal.evidence.map(file => <div key={file}><FileCode2 size={15} /><code>{file}</code></div>)}</div><div className="proposal-evidence-note"><ShieldCheck size={15} /><span>{proposal.kind === 'New idea' ? 'A product exploration, not a validated requirement.' : 'An investigation, not a confirmed defect.'} Check the evidence before changing code.</span></div>
        {proposal.session && <section className="proposal-linked-session"><div><MessageSquare size={16} /><span>{proposal.status === 'Done' ? 'OUTCOME SESSION' : 'LINKED SESSION'}</span></div><button onClick={() => { setSection('Threads'); setSessionView(true) }}>{proposal.session}<ArrowUpRight size={15} /></button><p>Continue the existing conversation instead of starting duplicate work.</p></section>}
        <div className="proposal-section-heading"><h3>Starting prompt</h3><span>You can edit this before starting</span></div><div className="proposal-instruction">{proposal.prompt}</div>
        <div className="proposal-document-actions">{proposal.status === 'Inbox' ? <><Button onClick={start}><Play size={13} />Start session</Button><Button variant="outline" onClick={() => update('Snoozed')}><Clock3 size={13} />Snooze until tomorrow</Button><button className="proposal-dismiss" onClick={() => update('Dismissed')}>Dismiss</button></> : proposal.status === 'In progress' ? <><Button onClick={() => { setSection('Threads'); setSessionView(true) }}><MessageSquare size={13} />Open session</Button><Button variant="outline" onClick={() => update('Done')}><Check size={13} />Mark done</Button></> : <Button variant="outline" onClick={() => update('Inbox')}><ArrowLeft size={13} />Return to inbox</Button>}</div>
        <p className="proposal-action-note">{proposal.status === 'Inbox' ? 'Start opens an editable prompt. Nothing runs without your confirmation.' : 'This mock only changes in-memory state. Reload to restore all sample proposals.'}</p>
        {!matches(proposal) && <button className="proposal-view-status" onClick={() => changeFilter(proposal.status)}>View {proposal.status.toLowerCase()} proposals <ArrowUpRight size={12} /></button>}
      </article> : section === 'Threads' ? <article className="proposal-page proposal-session-preview"><button className="proposal-back" onClick={() => { setSection('Proposals'); setSessionView(false) }}><ArrowLeft size={13} />Back to proposal</button><div className="proposal-kicker"><MessageSquare size={14} />{sessionView ? 'LINKED SESSION' : 'THREAD PREVIEW'}</div><h2>{proposal.session || 'Your conversations stay separate.'}</h2><p className="proposal-lede">{sessionView ? 'The proposal now points to a conversation in its project.' : 'Switch to Proposals to continue reviewing ideas.'}</p>{sessionView && <><div className="proposal-message"><span>YOU · {approach}</span><p>{proposal.prompt}</p></div><div className="proposal-message proposal-agent-message"><span>AGENT · SIMULATED</span><p>I would inspect the existing behavior first, verify the evidence, and propose a focused next step.</p></div><div className="proposal-mock-composer">Add more context to this session…<small>Preview only · no sending</small></div></>}</article> : <article className="proposal-page"><div className="proposal-kicker"><Clock3 size={14} />SCHEDULE PREVIEW</div><h2>Daily proposal review</h2><p className="proposal-lede">Discovery remains a scheduled routine, separate from the proposal inbox.</p><div className="proposal-instruction">Review registered projects and existing proposals. Update evidence, avoid duplicates, and respect snoozes and dismissals. Surface only worthwhile suggestions. Do not start implementation sessions automatically.</div><p className="proposal-action-note">Illustrative instruction only. No real schedule was created or modified.</p><Button variant="outline" onClick={() => setSection('Proposals')}>Return to proposals</Button></article>}</div>
      <div className="proposal-demo-state" role="status"><span>{notice}</span><small>{section} / {filter} / {proposal.id}: {proposal.status} · memory only</small></div>
    </main></div>
    <dialog ref={drawerRef} className="proposal-project-drawer" aria-label="Projects and proposals" onCancel={() => setDrawer(false)} onClick={e => { if (e.target === e.currentTarget) setDrawer(false) }}>{drawer && sidebar(true)}</dialog>
    <dialog ref={editor} className="proposal-launch-editor" aria-labelledby="proposal-launch-title" onCancel={() => setEditing(false)}><form onSubmit={e => { e.preventDefault(); simulateStart() }}><header><div><span># {proposal.project} / NEW SESSION</span><h2 id="proposal-launch-title">Start from this proposal</h2></div><Button type="button" variant="ghost" size="icon" aria-label="Close start preview" onClick={() => setEditing(false)}><X size={17} /></Button></header><div className="proposal-editor-body"><p>{proposal.title}</p><label>Approach<select value={approach} onChange={e => setApproach(e.target.value)}><option>Plan first</option><option>Investigate only</option><option>Implement scoped change</option></select></label><label>Initial prompt<textarea autoFocus required rows={9} value={prompt} onChange={e => setPrompt(e.target.value)} /></label><div className="proposal-editor-note"><ShieldCheck size={15} />Demo only. No actual session or agent will start.</div></div><footer><Button type="button" variant="outline" onClick={() => setEditing(false)}>Cancel</Button><Button type="submit" disabled={!prompt.trim()}><Play size={13} />Simulate start</Button></footer></form></dialog>
  </div>
}
createRoot(document.getElementById('root')!).render(<Prototype />)
