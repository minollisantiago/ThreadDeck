// THROWAWAY: single refined direction requested by the user, not three new alternatives.
// Uses production CSS, Button/Input, project structure, tree rows and pane header.
import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AlertCircle, ChevronDown, Clock3, Hash, Layers2, Menu, Play, Plus, Search, Settings2, SlidersHorizontal, SunMoon, X } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { mobileManagerStyle } from './mobile-style'
import '../styles.css'
import './workspace.css'
import './schedules-sidebar.prototype.css'

type Task = { id: number; project: string; title: string; prompt: string; cron: string; recurrence: string; next: string; short: string; once?: boolean; error?: string; agent: string; overlap: boolean }
const fixtures: Task[] = [
  { id: 3, project: 'naturalgas', title: 'Weekly backtests', prompt: 'Read routines/daily-ng-backtests.md and follow all instructions, including configured threshold eligibility before interpreting results.\n\nSummarize material changes and attach the backtest report. Ask for a decision only when there is something actionable.', cron: '0 12 * * 1', recurrence: 'Every Monday at 12:00 UTC', next: 'Monday, November 16 · 12:00 UTC', short: 'Mon · 12:00 UTC', agent: 'build', overlap: false },
  { id: 4, project: 'work-calendar', title: 'Weekly calendar', prompt: 'Read routines/weekly-work-calendar.md and follow its instructions to generate, attach, and open the previous-week calendar.', cron: '0 12 * * 1', recurrence: 'Every Monday at 12:00 UTC', next: 'Monday, November 16 · 12:00 UTC', short: 'Mon · 12:00 UTC', agent: 'build', overlap: false },
  { id: 2, project: 'work-calendar', title: 'Daily calendar', prompt: 'Read routines/daily-work-calendar.md and follow its instructions to generate, attach, and open the seven-day calendar.', cron: '0 12 * * 0,2-6', recurrence: 'Every day except Monday at 12:00 UTC', next: 'Tuesday, November 10 · 12:00 UTC', short: 'Tue · 12:00 UTC', error: 'Sample error: the previous calendar export could not be dispatched. This routine remains planned for its next occurrence.', agent: 'build', overlap: false },
  { id: 8, project: 'threaddeck', title: 'Release checklist', prompt: 'Review the release checklist and summarize remaining blockers. Ask for approval before publishing anything.', cron: '2026-11-12T09:00:00Z', recurrence: 'Once · November 12 at 09:00 UTC', next: 'Thursday, November 12 · 09:00 UTC', short: 'Thu · 09:00 UTC', once: true, agent: 'build', overlap: false },
]
const projects = ['naturalgas', 'work-calendar', 'threaddeck']
const threadTitles: Record<string, string[]> = { naturalgas: ['Weekly model review', 'Backtest results'], 'work-calendar': ['Calendar layout polish', 'Weekly export'], threaddeck: ['Schedule management UI'] }

function Prototype() {
  const [tasks, setTasks] = useState(fixtures), [selected, setSelected] = useState(3)
  const [mode, setMode] = useState<'threads' | 'schedules'>('schedules')
  const [query, setQuery] = useState(''), [filter, setFilter] = useState('all')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [light, setLight] = useState(false), [menu, setMenu] = useState(false)
  const [editing, setEditing] = useState(false), [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState<Task>(fixtures[0])
  const [confirmation, setConfirmation] = useState<'run' | 'delete' | null>(null)
  const [action, setAction] = useState('Select a routine from any project'), [toast, setToast] = useState('')
  const [thread, setThread] = useState('Schedule management UI')
  const editor = useRef<HTMLDialogElement>(null), confirm = useRef<HTMLDialogElement>(null), drawer = useRef<HTMLDialogElement>(null)
  const task = tasks.find(t => t.id === selected)
  useEffect(() => { document.documentElement.dataset.appearance = light ? 'light' : 'dark' }, [light])
  useEffect(() => { if (editing) editor.current?.showModal(); else editor.current?.close() }, [editing])
  useEffect(() => { if (confirmation) confirm.current?.showModal(); else confirm.current?.close() }, [confirmation])
  useEffect(() => { if (menu) drawer.current?.showModal(); else drawer.current?.close() }, [menu])
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 4000); return () => clearTimeout(timer) }, [toast])
  function edit(project?: string) {
    setCreating(Boolean(project))
    setDraft(project ? { ...fixtures[0], id: Math.max(8, ...tasks.map(t => t.id)) + 1, project, title: 'New routine', prompt: '', error: undefined } : { ...task! })
    setEditing(true)
  }
  function select(id: number) { setSelected(id); setMode('schedules'); setMenu(false); setAction(`Opened routine #${id}`) }
  function save(event: React.FormEvent) {
    event.preventDefault()
    const changed = creating || draft.cron !== task?.cron
    const saved = { ...draft, once: draft.cron.endsWith('Z'), ...(changed && { recurrence: 'Custom schedule · UTC', next: 'Requires Kimaki schedule validation', short: 'Custom · UTC' }) }
    setTasks(previous => creating ? [...previous, saved] : previous.map(t => t.id === saved.id ? saved : t))
    setCollapsed(previous => ({ ...previous, [saved.project]: false }))
    setSelected(saved.id); setMode('schedules'); setEditing(false); setAction(`Saved demo routine #${saved.id}`); setToast('Saved in memory only. Your real Kimaki routines are unchanged.')
  }
  function perform() {
    if (!task) return
    if (confirmation === 'delete' || task.once) {
      const remaining = tasks.filter(t => t.id !== task.id)
      setTasks(remaining); setSelected(remaining[0]?.id ?? 0)
    } else setTasks(previous => previous.map(t => t.id === task.id ? { ...t, error: undefined, next: 'Advanced · awaiting real scheduler calculation', short: 'Next time pending' } : t))
    setAction(`${confirmation === 'run' ? 'Simulated dispatch' : 'Deleted demo routine'} #${task.id}`)
    setToast(confirmation === 'run' ? 'Simulated dispatch only. No agent or shell command was started.' : 'Removed from this demo. Reload to restore.')
    setConfirmation(null)
  }
  function sidebar() {
    return <aside className="chat-manager" aria-label="Project schedule sidebar"><div className="app-shell" data-design="classic">
      <header className="page-header"><div className="identity"><div className="brand-icon"><Layers2 /></div><h1>ThreadDeck</h1></div><Button variant="ghost" size="icon" aria-label="Toggle appearance" onClick={() => setLight(!light)}><SunMoon size={17} /></Button><Button variant="ghost" size="icon" aria-label="Close project drawer" className="drawer-close" onClick={() => setMenu(false)}><X size={17} /></Button><span className="demo-label">DEMO</span></header>
      <div className="scope-tabs" aria-label="Sidebar content"><button aria-pressed={mode === 'threads'} onClick={() => setMode('threads')}>Threads</button><button aria-pressed={mode === 'schedules'} onClick={() => setMode('schedules')}>Schedules <span>{tasks.length}</span></button></div>
      <div className="overview"><div className="overview-counts"><span className="overview-pill overview-pill-working"><strong>{mode === 'schedules' ? tasks.length : 2}</strong>{mode === 'schedules' ? 'planned' : 'working'}</span><span className="overview-pill overview-pill-attention"><strong>{mode === 'schedules' ? tasks.filter(t => t.error).length : 1}</strong>{mode === 'schedules' ? 'error' : 'attention'}</span></div><div className="sidebar-actions"><Button variant="outline" size="icon" aria-label="New schedule" onClick={() => { setMenu(false); edit(task?.project || 'threaddeck') }}><Plus size={16} /></Button></div></div>
      <main><div className="toolbar"><div className="search-field"><Search /><Input aria-label="Search projects or schedules" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={`Search projects or ${mode === 'schedules' ? 'schedules' : 'threads'}…`} /></div><div className="filter-group">{(mode === 'schedules' ? ['all', 'recurring', 'one-time'] : ['all', 'active']).map(f => <button key={f} className={filter === f ? 'filter-selected' : ''} onClick={() => setFilter(f)}>{f === 'all' ? 'All' : f === 'one-time' ? 'One-time' : f[0].toUpperCase() + f.slice(1)}</button>)}</div></div>
      <div className="section-caption"><span>PROJECTS <span className="caption-count">03</span></span><span className="sidebar-kind">{mode === 'schedules' ? 'SCHEDULES' : 'THREADS'}</span></div>
      <div className="project-list">{projects.map(p => {
        const rows = tasks.filter(t => t.project === p && `${p} ${t.title} ${t.prompt}`.toLowerCase().includes(query.toLowerCase()) && (filter !== 'recurring' || !t.once) && (filter !== 'one-time' || t.once))
        const threads = threadTitles[p].filter(t => `${p} ${t}`.toLowerCase().includes(query.toLowerCase()))
        if (mode === 'schedules' ? !rows.length : !threads.length) return null
        return <section className="project-panel" key={p}><div className="project-heading"><button className="project-toggle" aria-label={`Toggle ${p}`} aria-expanded={!collapsed[p]} onClick={() => setCollapsed({ ...collapsed, [p]: !collapsed[p] })} /><ChevronDown className={`chevron ${collapsed[p] ? 'is-closed' : ''}`} /><Hash className="project-channel-icon" /><span className="project-name">{p}</span><span className="project-pills"><span className="project-total">{mode === 'schedules' ? `${rows.length} schedules` : `${threads.length} sessions`}</span><button className="project-add" aria-label={`Add schedule in ${p}`} onClick={() => { setMenu(false); edit(p) }}><Plus size={13} /></button></span></div>
        {!collapsed[p] && <div className="project-sessions">{mode === 'schedules' ? rows.map(t => <div className="session-row schedule-tree-row" data-selected={selected === t.id} key={t.id}><div className="session-copy"><button className="session-title" onClick={() => select(t.id)}>{t.title}</button><span className="task-row-time"><Clock3 size={10} />{t.short}</span></div><span className={`task-kind ${t.error ? 'task-error' : ''}`} title={t.error ? 'Previous dispatch error' : t.once ? 'One-time schedule' : 'Recurring schedule'}>{t.error ? <AlertCircle size={13} /> : <Clock3 size={12} />}</span></div>) : threads.map(title => <div className="session-row" key={title}><div className="session-copy"><button className="session-title" onClick={() => { setThread(title); setMenu(false) }}>{title}</button></div><span className="status status-idle">Idle</span></div>)}</div>}</section>
      })}</div></main>
      <footer><span>LOCAL · FIXTURE ONLY</span><span className="profile-initial">S</span></footer>
    </div></aside>
  }
  return <div className="schedule-sidebar-study"><style>{mobileManagerStyle}</style><div className="study-titlebar"><span><Layers2 size={12} />ThreadDeck <span>PROJECT SCHEDULES</span></span><b>INTERACTIVE MOCKUP · NOT CONNECTED</b><span>− &nbsp; □ &nbsp; ×</span></div><div className="chat-workspace">
    <div className="desktop-manager">{sidebar()}</div>
    <main className="chat-pane"><header className="chat-pane-header"><Button variant="ghost" size="icon" className="open-projects" aria-label="Open projects" onClick={() => setMenu(true)}><Menu size={17} /></Button><div><span className="chat-channel-name"><span className="channel-hash">#</span>{mode === 'schedules' ? task?.project || 'workspace' : 'threaddeck'}</span><strong className="chat-thread-title">{mode === 'schedules' ? task?.title || 'Choose a schedule' : thread}</strong></div>{mode === 'schedules' && task && <Button variant="outline" className="header-edit" onClick={() => edit()}><Settings2 size={14} />Edit schedule</Button>}<Button variant="ghost" size="icon" aria-label="Toggle appearance in main pane" onClick={() => setLight(!light)}><SunMoon size={15} /></Button></header>
    <div className="chat-transcript task-document">{mode === 'schedules' ? task ? <article className="task-page">
      <div className="task-kicker"><Clock3 size={14} />SCHEDULE <span>#{task.id}</span><span className="planned"><i />Planned</span></div><h2>{task.title}</h2><p className="task-lede">{task.once ? 'One instruction, one scheduled dispatch.' : 'A recurring instruction for this project.'} Managed by Kimaki.</p>
      <section className="next-run"><div><span className="doc-label">NEXT PLANNED RUN</span><strong>{task.next}</strong><small>{task.recurrence}</small></div><Clock3 size={32} strokeWidth={1} /></section>
      <div className="task-section-heading"><h3>Instruction</h3><span>Full prompt · demo content</span></div><div className="instruction-text">{task.prompt}</div>
      <section className="task-settings"><h3>Configuration</h3><dl><dt>Project / channel</dt><dd><Hash size={12} />{task.project}</dd><dt>Destination</dt><dd>{task.once ? 'Continue “Release preparation”' : 'New conversation each run'}</dd><dt>Schedule</dt><dd><code>{task.cron}</code><span className="utc-tag">UTC</span></dd><dt>Agent / model</dt><dd>{task.agent || 'Default'}<span className="dim">/ project default</span></dd><dt>Overlap policy</dt><dd>{task.overlap ? 'Allow concurrent sessions' : 'Skip if the previous session is busy'}</dd></dl></section>
      {task.error && <div className="task-alert"><AlertCircle size={17} /><div><strong>Previous dispatch had an error</strong><p>{task.error}</p></div></div>}
      <div className="task-actions"><Button onClick={() => setConfirmation('run')}><Play size={13} />Run now</Button><Button variant="outline" onClick={() => edit()}><SlidersHorizontal size={13} />Edit schedule</Button><button className="delete-task" onClick={() => setConfirmation('delete')}>Delete schedule…</button></div><p className="dispatch-note">{task.once ? 'Run now consumes this one-time schedule.' : 'Run now dispatches an occurrence and advances its next planned time.'} Dispatch does not mean the AI turn has finished.</p>
      <div className="task-design-note">One sidebar. Same project groups, same thread-style rows. This pane replaces chat while a schedule is selected.</div>
    </article> : <div className="no-task"><Clock3 /><h2>Choose a schedule</h2><p>Select one under a project, or create a new one.</p><Button onClick={() => setMenu(true)}>Browse projects</Button></div> : <article className="task-page mock-chat"><div className="task-kicker">CONVERSATION PREVIEW</div><h2>{thread}</h2><p className="mock-user">Let’s keep schedules alongside our projects, with the same familiar sidebar.</p><p>Switch back to <strong>Schedules</strong> in the sidebar to inspect a task. Your conversation remains a separate workspace item.</p><div className="mock-draft">Your unsent message stays here…<span>Fixture only · no sending or backend connection</span></div></article>}</div>
    <div className="study-state"><span>DEMO / {mode} / {task ? `routine #${task.id}` : 'none selected'}</span><span>{action} · in-memory only</span></div></main>
    </div>
    <dialog ref={drawer} className="projects-drawer" aria-label="Projects" onCancel={() => setMenu(false)} onClick={e => { if (e.target === e.currentTarget) setMenu(false) }}>{menu && sidebar()}</dialog>
    <dialog ref={editor} className="task-editor" aria-labelledby="editor-title" onCancel={() => setEditing(false)}><form onSubmit={save}><header><div><span className="doc-label"># {draft.project} / {creating ? 'NEW ROUTINE' : `ROUTINE ${draft.id}`}</span><h2 id="editor-title">{creating ? 'New project schedule' : 'Edit schedule'}</h2></div><Button type="button" variant="ghost" size="icon" aria-label="Close editor" onClick={() => setEditing(false)}><X size={17} /></Button></header>
      <div className="editor-body"><p className="edit-context">{creating ? 'This schedule will belong to the project you selected.' : draft.title} <span className="demo-inline">DEMO</span></p>
      {creating && <label>Project<select value={draft.project} onChange={e => setDraft({ ...draft, project: e.target.value })}>{projects.map(p => <option key={p}>{p}</option>)}</select></label>}
      <label>Instruction<textarea aria-label="Instruction" autoFocus required value={draft.prompt} onChange={e => setDraft({ ...draft, prompt: e.target.value })} placeholder="What should Kimaki do?" /></label>
      <div className="editor-columns"><label>Schedule · UTC<Input required value={draft.cron} onChange={e => setDraft({ ...draft, cron: e.target.value })} /><small>Cron expression or a future ISO timestamp ending in Z.</small></label><label>Agent<Input value={draft.agent} onChange={e => setDraft({ ...draft, agent: e.target.value })} placeholder="Project default" /><small>Model inherits the project default.</small></label></div>
      <label>When the previous session is still busy<select value={String(draft.overlap)} onChange={e => setDraft({ ...draft, overlap: e.target.value === 'true' })}><option value="false">Skip this occurrence</option><option value="true">Allow concurrent sessions</option></select></label><p className="editor-caveat">Full prompt editing needs the proposed bridge detail API. Changes here are simulated, and schedule validation is not connected.</p></div>
      <footer><Button type="button" variant="outline" onClick={() => setEditing(false)}>Cancel</Button><Button type="submit">{creating ? 'Create demo schedule' : 'Save demo changes'}</Button></footer></form></dialog>
    <dialog ref={confirm} className="task-confirm" aria-labelledby="confirmation-title" onCancel={() => setConfirmation(null)}><h2 id="confirmation-title">{confirmation === 'run' ? 'Run this schedule now?' : 'Delete this schedule?'}</h2><p><strong>{task?.title}</strong> · #{task?.project}</p><p>{confirmation === 'run' ? `${task?.once ? 'This consumes the one-time schedule.' : 'This advances the next planned run.'} Any configured pre-run command would execute too. This demo starts nothing.` : 'Removes the schedule, not a session already dispatched. It cannot stop a current AI turn. Only the fixture is deleted here.'}</p><footer><Button variant="outline" onClick={() => setConfirmation(null)}>Cancel</Button><Button onClick={perform}>{confirmation === 'run' ? 'Simulate dispatch' : 'Delete demo schedule'}</Button></footer></dialog>
    {toast && <div className="study-toast" role="status">{toast}</div>}
  </div>
}
createRoot(document.getElementById('root')!).render(<Prototype />)
