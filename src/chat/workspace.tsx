import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Layers2, Plus, Search, X } from 'lucide-react'
import type { Project, Session, Snapshot } from '../../shared/model'
import { fuzzyScore } from '../../shared/search'
import { DesktopTitlebar } from '../components/desktop-titlebar'
import { ConversationSearch } from '../components/conversation-search'
import { useUnread } from '../hooks/use-unread'
import { SelectedSession, SessionNavigation, WorkspaceControls } from './navigation'
import type { ChatTarget } from './pane'
import { mobileManagerStyle } from './mobile-style'
import { ConversationSkeleton } from './conversation-skeleton'
import { SidebarToggle } from './sidebar-toggle'
import { ProjectBrowser } from './project-browser'
import { Kbd, KbdGroup } from '../components/ui/kbd'
import './workspace.css'
const ConversationPane = lazy(async () => ({ default: (await import('./pane')).ConversationPane }))
const sidebarMinWidth = 430, sidebarMaxRatio = .3
const lastSessionKey = 'threaddeck:chat-last-session'
function rememberSession(session: Session) { try { localStorage.setItem(lastSessionKey, session.id) } catch { /* optional navigation preference */ } }

export function SessionFinder({ sessions, projects, select, create, close, history, initialNewThread: newThread = false, currentProject, newSession }: { sessions: Session[]; projects: Project[]; select: (session: Session) => void; create: (project: Project) => void; close: () => void; history: () => void; initialNewThread?: boolean; currentProject?: Project; newSession?: () => void }) {
  const [query, setQuery] = useState(''), [index, setIndex] = useState(0)
  const dialog = useRef<HTMLDialogElement>(null), input = useRef<HTMLInputElement>(null), results = useRef<HTMLDivElement>(null)
  useEffect(() => { input.current?.focus() }, [])
  useLayoutEffect(() => { const previous = document.activeElement, panel = dialog.current; panel?.showModal(); input.current?.focus(); return () => { panel?.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus() } }, [])
  const hits = sessions.map(session => ({ session, score: query ? Math.max(fuzzyScore(query, session.title), fuzzyScore(query, projects.find(p => p.id === session.projectId)?.name || '')) : session.updatedAt })).filter(hit => hit.score > 0).sort((a, b) => b.score - a.score).slice(0, 100)
  const projectHits = projects.map(project => ({ project, score: query ? fuzzyScore(query, project.name) : 1 })).filter(hit => hit.score > 0).sort((a, b) => b.score - a.score)
  const count = newThread ? projectHits.length : hits.length
  useEffect(() => { results.current?.querySelectorAll('button')[index]?.scrollIntoView?.({ block: 'nearest' }) }, [index, query, newThread])
  return <dialog ref={dialog} className={`chat-session-finder${newThread ? '' : ' conversation-finder-frame'}`} aria-label={newThread ? 'New thread / OpenCode session' : 'Find a session'} onKeyDown={e => {
    if (e.nativeEvent.isComposing || e.repeat || ['Control', 'Meta', 'Alt', 'Shift'].includes(e.key)) return
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k' && !newThread) {
      e.preventDefault(); e.stopPropagation(); history(); return
    }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'n') {
      e.preventDefault(); e.stopPropagation()
      if (e.shiftKey && currentProject) create(currentProject)
      else if (!e.shiftKey && !newThread) newSession?.()
    }
  }} onCancel={event => { event.preventDefault(); close() }} onClick={event => { if (event.target === dialog.current) close() }}>
    <header><Search size={18} /><input ref={input} aria-label={newThread ? 'Find a project' : 'Find a session'} placeholder={newThread ? 'Find a project…' : 'Find a conversation…'} value={query} onChange={e => { setQuery(e.target.value); setIndex(0) }} onKeyDown={e => { if (e.nativeEvent.isComposing) return; if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setIndex(i => Math.max(0, Math.min(count - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))) } if (e.key === 'Enter') { e.preventDefault(); if (newThread) { if (projectHits[index]) create(projectHits[index].project) } else if (hits[index]) select(hits[index].session) } }} /><button aria-label="Close session finder" onClick={close}><X size={18} /></button></header>
    {newThread && currentProject && <button className="chat-new-thread" aria-keyshortcuts="Control+Shift+N Meta+Shift+N" onClick={() => create(currentProject)}><Plus size={14} /><span>New session in {currentProject.name}</span><KbdGroup><Kbd>Ctrl / ⌘</Kbd>+<Kbd>Shift</Kbd>+<Kbd>N</Kbd></KbdGroup></button>}
    {!newThread && <button className="chat-new-thread" aria-keyshortcuts="Control+K Meta+K" onClick={history}><Search size={14} /><span>Search conversation history…</span><KbdGroup><Kbd>Ctrl / ⌘</Kbd>+<Kbd>K</Kbd></KbdGroup></button>}
    <div ref={results} className="chat-finder-results">{newThread ? projectHits.map(({ project }, i) => <button key={project.id} className={index === i ? 'selected' : ''} onMouseMove={() => setIndex(i)} onClick={() => create(project)}><strong>{project.name}</strong><small>Create an OpenCode session and Discord thread</small></button>) : hits.map(({ session }, i) => <button key={session.id} className={index === i ? 'selected' : ''} onClick={() => select(session)} onMouseMove={() => setIndex(i)}><strong>{session.title}</strong><small>{projects.find(p => p.id === session.projectId)?.name} · {session.status}</small></button>)}{!count && <p className="chat-muted">{newThread ? 'No matching projects.' : 'No matching sessions.'}</p>}</div>
    <footer className="chat-finder-keybindings"><span><Kbd>↑ ↓</Kbd> navigate</span><span><Kbd>Enter</Kbd> {newThread ? 'create' : 'open'}</span><span><Kbd>Esc</Kbd> exit</span></footer>
  </dialog>
}
function ProjectDiscovery({ close, create }: { close: () => void; create: (project: Project) => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useLayoutEffect(() => { const previous = document.activeElement, panel = dialog.current; panel?.showModal(); return () => { panel?.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus() } }, [])
  return <dialog ref={dialog} className="chat-session-finder conversation-finder-frame" aria-label="Discover / add project" onCancel={event => { event.preventDefault(); close() }} onClick={event => { if (event.target === dialog.current) close() }}><ProjectBrowser close={close} create={create} /></dialog>
}
export function ChatWorkspace({ snapshot, children }: { snapshot: Snapshot | null; children: ReactNode }) {
  const [target, setTarget] = useState<ChatTarget | null>(null), [finder, setFinder] = useState(false), [drawer, setDrawer] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [newThread, setNewThread] = useState(false)
  const [discovering, setDiscovering] = useState(false)
  const [focusRequest, setFocusRequest] = useState(0)
  const restored = useRef(false), [missingSession, setMissingSession] = useState(false)
  const [desktopSession, setDesktopSession] = useState<string | null>(null)
  const [viewportWidth, setViewportWidth] = useState(innerWidth), [sidebar, setSidebar] = useState(() => localStorage.getItem('threaddeck:chat-sidebar') !== 'false')
  const narrow = viewportWidth < Math.ceil(sidebarMinWidth / sidebarMaxRatio)
  const [width, setWidth] = useState(() => Number(localStorage.getItem('threaddeck:chat-sidebar-width')) || 430)
  const projects = snapshot?.projects || [], sessions = projects.flatMap(project => project.sessions), manager = useRef<HTMLElement>(null)
  const { markRead } = useUnread(projects)
  const current = useRef({ target, sessions, projects }); current.current = { target, sessions, projects }
  const chord = useRef(0), spaces = useRef(0)
  const pendingFocus = useRef<'focus' | 'toggle' | null>(null)
  const open = useCallback((session: Session) => {
    const project = current.current.projects.find(p => p.id === session.projectId)
    if (project) { rememberSession(session); setTarget({ session, project }); setFocusRequest(value => value + 1); setFinder(false); setNewThread(false); setHistoryOpen(false); setDiscovering(false); setDrawer(false) }
  }, [])
  const find = useCallback(() => { setNewThread(false); setDiscovering(false); setHistoryOpen(false); setFinder(true) }, [])
  const newSession = useCallback(() => { setFinder(false); setHistoryOpen(false); setDiscovering(false); setNewThread(true) }, [])
  const discover = useCallback(() => { setFinder(false); setNewThread(false); setHistoryOpen(false); setDiscovering(true) }, [])
  useEffect(() => window.threaddeckDesktop?.onOpenSession?.(setDesktopSession), [])
  useEffect(() => {
    if (!desktopSession) return
    const session = sessions.find(item => item.id === desktopSession)
    if (session) { restored.current = true; open(session); setDesktopSession(null) }
  }, [desktopSession, sessions, open])
  useEffect(() => {
    window.threaddeckDesktop?.viewing?.(target?.session?.id ?? null)
    return () => window.threaddeckDesktop?.viewing?.(null)
  }, [target?.session?.id])
  const start = useCallback((project: Project) => {
    const original = current.current.projects.find(item => item.id === project.id) || project
    setTarget({ project: original }); setFocusRequest(value => value + 1); setFinder(false); setNewThread(false); setDiscovering(false); setHistoryOpen(false); setDrawer(false)
  }, [])
  useEffect(() => {
    if (restored.current || desktopSession || !snapshot || snapshot.health !== 'connected' || finder || historyOpen || newThread || discovering) return
    if (target) { restored.current = true; return } // Never replace explicit navigation.
    let saved: string | null = null
    try { saved = localStorage.getItem(lastSessionKey) } catch { /* optional navigation preference */ }
    if (!saved) { restored.current = true; return }
    const session = snapshot.projects.flatMap(project => project.sessions).find(session => session.id === saved)
    if (session) { restored.current = true; open(session) }
    // A connected backend can still have an incomplete startup inventory. Keep
    // watching subsequent snapshots rather than consuming the restore attempt.
    else setMissingSession(true)
  }, [snapshot, open, target, finder, historyOpen, newThread, discovering, desktopSession])
  useEffect(() => {
    if (!target) return
    restored.current = true; setMissingSession(false)
  }, [target])
  useEffect(() => {
    const resize = () => setViewportWidth(innerWidth)
    window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize)
  }, [])
  useEffect(() => setDrawer(false), [narrow])
  useEffect(() => { try { localStorage.setItem('threaddeck:chat-sidebar', String(sidebar)); localStorage.setItem('threaddeck:chat-sidebar-width', String(width)) } catch { /* optional layout preference */ } }, [sidebar, width])
  useEffect(() => {
    const flushFocus = () => {
      if (!pendingFocus.current || !document.querySelector('[data-chat-ready]')) return
      const detail = pendingFocus.current; pendingFocus.current = null
      window.dispatchEvent(new CustomEvent('threaddeck:composer-request', { detail }))
    }
    const focus = (toggle = false) => {
      for (const panel of document.querySelectorAll<HTMLElement>('[popover]:popover-open')) panel.hidePopover()
      if (!current.current.target && current.current.sessions[0]) open(current.current.sessions[0])
      else if (!current.current.target) { setFinder(true); return }
      setDrawer(false)
      pendingFocus.current = toggle ? 'toggle' : 'focus'
      requestAnimationFrame(flushFocus)
    }
    const key = (event: KeyboardEvent) => {
      if (event.isComposing || event.repeat || ['Control', 'Meta', 'Alt', 'Shift'].includes(event.key)) return
      if (document.querySelector('dialog[open]')) return
      const ctrl = event.ctrlKey || event.metaKey, p = event.key.toLowerCase() === 'p'
      if (p && !event.altKey && !event.shiftKey && chord.current && performance.now() - chord.current < 550) { event.preventDefault(); event.stopPropagation(); chord.current = 0; focus(true); return }
      if (ctrl && p && !event.altKey && !event.shiftKey) { event.preventDefault(); event.stopPropagation(); chord.current = performance.now(); focus(); return }
      chord.current = 0
      if (ctrl && event.key.toLowerCase() === 'j' && !event.altKey && !event.shiftKey) { event.preventDefault(); event.stopPropagation(); discover(); return }
      if (ctrl && event.key.toLowerCase() === 'n' && !event.altKey) {
        event.preventDefault(); event.stopPropagation()
        if (event.shiftKey && current.current.target) start(current.current.target.project)
        else newSession()
        return
      }
      if (ctrl && (event.key.toLowerCase() === 'k' || event.key === 'Tab' && Boolean(window.threaddeckDesktop))) { event.preventDefault(); event.stopPropagation(); setNewThread(false); setFinder(true); return }
      if (ctrl && event.key === 'Enter' && current.current.target && (event.target as HTMLElement).closest('.chat-composer')) { event.preventDefault(); event.stopPropagation(); window.dispatchEvent(new CustomEvent('threaddeck:composer-submit', { detail: event.shiftKey ? 'queue' : 'send' })); return }
      const el = event.target as HTMLElement
      if (event.code === 'Space' && !ctrl && !event.altKey && !el.closest('input,textarea,select,[contenteditable],button,a,[role="button"],dialog')) {
        event.preventDefault(); event.stopPropagation(); const now = performance.now()
        if (spaces.current && now - spaces.current < 350) { setNewThread(false); setFinder(true); spaces.current = 0 } else spaces.current = now
      } else spaces.current = 0
    }
    const typing = () => { chord.current = 0 }
    window.addEventListener('input', typing, true); window.addEventListener('pointerdown', typing, true); window.addEventListener('threaddeck:pane-ready', flushFocus)
    window.addEventListener('keydown', key, true)
    return () => { window.removeEventListener('keydown', key, true); window.removeEventListener('input', typing, true); window.removeEventListener('pointerdown', typing, true); window.removeEventListener('threaddeck:pane-ready', flushFocus) }
  }, [open, start, newSession, discover])
  useEffect(() => {
    if (!drawer || !narrow) return
    const previous = document.activeElement
    manager.current?.querySelector<HTMLElement>('button,input,a')?.focus()
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || (event.target instanceof HTMLElement && event.target.closest('[role="menu"]'))) return
      if (document.querySelector('dialog[open]')) return
      if (event.key === 'Escape' && !document.querySelector('[popover]:popover-open')) { event.preventDefault(); setDrawer(false) }
      if (event.key === 'Tab' && manager.current) {
        const controls = [...manager.current.querySelectorAll<HTMLElement>('button,input,a,select')].filter(el => !el.hasAttribute('disabled') && el.getBoundingClientRect().width > 0)
        const first = controls[0], last = controls.at(-1)
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }
    window.addEventListener('keydown', key)
    return () => { window.removeEventListener('keydown', key); if (previous instanceof HTMLElement && previous.isConnected) previous.focus() }
  }, [drawer, narrow])
  const active = target?.session ? sessions.find(s => s.id === target.session!.id) || target.session : undefined
  const selected = target ? { ...target, ...(active && { session: active }) } : null
  const maxWidth = Math.floor(viewportWidth * sidebarMaxRatio), sidebarWidth = Math.max(sidebarMinWidth, Math.min(width, maxWidth))
  const sidebarOpen = !target || (narrow ? drawer : sidebar)
  const toggleSidebar = () => { if (target) { if (narrow) setDrawer(value => !value); else setSidebar(value => !value) } }
  return <SelectedSession.Provider value={active?.id || null}><SessionNavigation.Provider value={open}><WorkspaceControls.Provider value={{ compact: true, find, discover, create: project => { if (project) start(project); else newSession() }, threadId: active?.threadId, ...(target && { toggleSidebar }), sidebarOpen }}><DesktopTitlebar /><div className={`chat-workspace ${!target ? 'manager-only' : ''}`} style={{ height: window.threaddeckDesktop ? 'calc(100dvh - 38px)' : '100dvh', '--chat-sidebar-width': `${sidebarWidth}px` } as React.CSSProperties}>
    <style>{mobileManagerStyle}</style>
    {target && narrow && <button className="chat-drawer-backdrop" data-open={drawer} aria-hidden={!drawer} tabIndex={drawer ? 0 : -1} aria-label="Close sidebar" onClick={() => setDrawer(false)} />}
    <div className={`chat-sidebar-slot ${target && narrow ? 'mobile' : ''}`} data-open={sidebarOpen}>
      <aside id="session-manager" ref={manager} inert={!sidebarOpen} aria-hidden={!sidebarOpen} data-open={sidebarOpen} className={`chat-manager ${target && narrow ? 'drawer' : ''}`} aria-label="Session manager" {...(target && narrow && drawer ? { role: 'dialog', 'aria-modal': true } : {})}>{children}</aside>
      {target && !narrow && !sidebar && <SidebarToggle open={false} toggle={toggleSidebar} className="chat-sidebar-reopen" />}
    </div>
    {target && !narrow && sidebar && <div className="chat-resizer" role="separator" tabIndex={0} aria-label="Resize sidebar" aria-orientation="vertical" aria-valuemin={sidebarMinWidth} aria-valuemax={maxWidth} aria-valuenow={sidebarWidth} onPointerDown={event => {
      const element = event.currentTarget; element.setPointerCapture(event.pointerId)
      const move = (e: PointerEvent) => setWidth(Math.max(sidebarMinWidth, Math.min(maxWidth, e.clientX)))
      const stop = () => { element.removeEventListener('pointermove', move); element.removeEventListener('pointerup', stop); element.removeEventListener('pointercancel', stop) }
      element.addEventListener('pointermove', move); element.addEventListener('pointerup', stop); element.addEventListener('pointercancel', stop)
    }} onKeyDown={e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); setWidth(Math.max(sidebarMinWidth, Math.min(maxWidth, sidebarWidth + (e.key === 'ArrowRight' ? 20 : -20)))) } }} />}
    {selected && <Suspense fallback={<main className="chat-pane"><div className="chat-transcript"><ConversationSkeleton /></div></main>}><ConversationPane key={selected.session?.id || `new:${selected.project.id}`} target={selected} focusRequest={focusRequest} mobileSidebar={narrow} sidebarOpen={sidebarOpen} sidebar={toggleSidebar} created={(session, project) => { rememberSession(session); setTarget({ session, project }); setFocusRequest(value => value + 1) }} markRead={markRead} /></Suspense>}
    {!target && <main className="chat-pane chat-empty-workspace"><div><Layers2 size={36} strokeWidth={1.2} aria-hidden="true" /><h2>{missingSession ? 'Your last thread is unavailable' : 'Pick up a conversation'}</h2><p>{missingSession ? 'It isn’t in the available sessions. Choose another thread or start a new one.' : 'Choose a thread from the sidebar, or find somewhere new to start.'}</p><button onClick={find}>Find a thread <kbd>Ctrl K</kbd></button></div></main>}
    {!target && <button className="chat-manager-new" onClick={find}><Search size={15} />Find conversation <kbd>Ctrl K</kbd></button>}
    {finder && <SessionFinder currentProject={target?.project} sessions={sessions} projects={projects} select={open} create={start} close={() => setFinder(false)} newSession={newSession} history={() => { setFinder(false); setHistoryOpen(true) }} />}
    {newThread && <SessionFinder initialNewThread currentProject={target?.project} sessions={sessions} projects={projects} select={open} create={start} close={() => setNewThread(false)} history={() => {}} />}
    {discovering && <ProjectDiscovery close={() => setDiscovering(false)} create={start} />}
    {historyOpen && <ConversationSearch close={() => setHistoryOpen(false)} titleSearch={find} onSelect={hit => {
      const known = sessions.find(session => session.id === hit.id)
      if (known) { open(known); return true }
      const candidates = projects.filter(project => project.name === hit.project)
      if (candidates.length !== 1) return false // Preserve the existing Discord fallback when project names are ambiguous.
      open({ id: hit.id, threadId: hit.threadId, guildId: hit.guildId, title: hit.title, projectId: candidates[0].id, updatedAt: hit.updatedAt, status: 'idle', agentCount: 0 }); return true
    }} />}
  </div></WorkspaceControls.Provider></SessionNavigation.Provider></SelectedSession.Provider>
}
