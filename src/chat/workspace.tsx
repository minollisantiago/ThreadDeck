import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Plus, Search, X } from 'lucide-react'
import type { Project, Session, Snapshot } from '../../shared/model'
import { fuzzyScore } from '../../shared/search'
import { DesktopTitlebar } from '../components/desktop-titlebar'
import { ConversationSearch } from '../components/conversation-search'
import { useUnread } from '../hooks/use-unread'
import { SelectedSession, SessionNavigation, WorkspaceControls } from './navigation'
import type { ChatTarget } from './pane'
import { mobileManagerStyle } from './mobile-style'
import './workspace.css'
const ConversationPane = lazy(async () => ({ default: (await import('./pane')).ConversationPane }))

function SessionFinder({ sessions, projects, select, create, close, history }: { sessions: Session[]; projects: Project[]; select: (session: Session) => void; create: (project: Project) => void; close: () => void; history: () => void }) {
  const [query, setQuery] = useState(''), [index, setIndex] = useState(0), [newThread, setNewThread] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null), input = useRef<HTMLInputElement>(null), results = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => { const previous = document.activeElement; dialog.current?.showModal(); input.current?.focus(); return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus() } }, [])
  const hits = sessions.map(session => ({ session, score: query ? Math.max(fuzzyScore(query, session.title), fuzzyScore(query, projects.find(p => p.id === session.projectId)?.name || '')) : session.updatedAt })).filter(hit => hit.score > 0).sort((a, b) => b.score - a.score).slice(0, 100)
  useEffect(() => { results.current?.querySelectorAll('button')[index]?.scrollIntoView?.({ block: 'nearest' }) }, [index])
  return <dialog ref={dialog} className="chat-session-finder" aria-label={newThread ? 'New conversation' : 'Find a session'} onCancel={event => { event.preventDefault(); close() }} onClick={event => { if (event.target === dialog.current) close() }}>
    <header><Search size={18} /><input ref={input} aria-label="Find a session" placeholder={newThread ? 'Choose a project below' : 'Find a conversation…'} value={query} onChange={e => { setQuery(e.target.value); setIndex(0) }} onKeyDown={e => { if (newThread) return; if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setIndex(i => Math.max(0, Math.min(hits.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))) } if (e.key === 'Enter' && hits[index]) select(hits[index].session) }} /><button aria-label="Close session finder" onClick={close}><X size={18} /></button></header>
    <button className="chat-new-thread" onClick={() => { setNewThread(value => !value); setQuery(''); input.current?.focus() }}><Plus size={14} />{newThread ? 'Back to sessions' : 'New linked conversation'}</button>
    {!newThread && <button className="chat-new-thread" onClick={history}>Search conversation history…</button>}
    <div ref={results} className="chat-finder-results">{newThread ? projects.filter(p => p.name.toLowerCase().includes(query.toLowerCase())).map(project => <button key={project.id} onClick={() => create(project)}><strong>{project.name}</strong><small>Create a Kimaki session and Discord thread</small></button>) : hits.map(({ session }, i) => <button key={session.id} className={index === i ? 'selected' : ''} onClick={() => select(session)} onMouseMove={() => setIndex(i)}><strong>{session.title}</strong><small>{projects.find(p => p.id === session.projectId)?.name} · {session.status}</small></button>)}</div>
    <footer>↑ ↓ select · Enter open · Esc return · Ctrl K</footer>
  </dialog>
}
export function ChatWorkspace({ snapshot, children }: { snapshot: Snapshot | null; children: ReactNode }) {
  const [target, setTarget] = useState<ChatTarget | null>(null), [finder, setFinder] = useState(false), [drawer, setDrawer] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [narrow, setNarrow] = useState(innerWidth < 1080), [sidebar, setSidebar] = useState(() => localStorage.getItem('threaddeck:chat-sidebar') !== 'false')
  const [width, setWidth] = useState(() => Number(localStorage.getItem('threaddeck:chat-sidebar-width')) || 430)
  const projects = snapshot?.projects || [], sessions = projects.flatMap(project => project.sessions), manager = useRef<HTMLElement>(null)
  const { markRead } = useUnread(projects)
  const current = useRef({ target, sessions, projects }); current.current = { target, sessions, projects }
  const chord = useRef(0), spaces = useRef(0)
  const pendingFocus = useRef<'focus' | 'toggle' | null>(null)
  const open = useCallback((session: Session) => {
    const project = current.current.projects.find(p => p.id === session.projectId)
    if (project) { setTarget({ session, project }); setFinder(false); setHistoryOpen(false); setDrawer(false) }
  }, [])
  const find = useCallback(() => setFinder(true), [])
  useEffect(() => {
    const resize = () => setNarrow(innerWidth < 1080)
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
      if (ctrl && (event.key.toLowerCase() === 'k' || event.key === 'Tab' && Boolean(window.threaddeckDesktop))) { event.preventDefault(); event.stopPropagation(); setFinder(true); return }
      if (ctrl && event.key === 'Enter' && current.current.target && (event.target as HTMLElement).closest('.chat-composer')) { event.preventDefault(); event.stopPropagation(); window.dispatchEvent(new CustomEvent('threaddeck:composer-submit', { detail: event.shiftKey ? 'queue' : 'send' })); return }
      const el = event.target as HTMLElement
      if (event.code === 'Space' && !ctrl && !event.altKey && !el.closest('input,textarea,select,[contenteditable],button,a,[role="button"],dialog')) {
        event.preventDefault(); event.stopPropagation(); const now = performance.now()
        if (spaces.current && now - spaces.current < 350) { setFinder(true); spaces.current = 0 } else spaces.current = now
      } else spaces.current = 0
    }
    const typing = () => { chord.current = 0 }
    window.addEventListener('input', typing, true); window.addEventListener('pointerdown', typing, true); window.addEventListener('threaddeck:pane-ready', flushFocus)
    window.addEventListener('keydown', key, true)
    return () => { window.removeEventListener('keydown', key, true); window.removeEventListener('input', typing, true); window.removeEventListener('pointerdown', typing, true); window.removeEventListener('threaddeck:pane-ready', flushFocus) }
  }, [open])
  useEffect(() => {
    if (!drawer || !narrow) return
    const previous = document.activeElement
    manager.current?.querySelector<HTMLElement>('button,input,a')?.focus()
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('[popover]:popover-open')) { event.preventDefault(); setDrawer(false) }
      if (event.key === 'Tab' && manager.current) {
        const controls = [...manager.current.querySelectorAll<HTMLElement>('button,input,a')].filter(el => el.getBoundingClientRect().width > 0)
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
  return <SelectedSession.Provider value={active?.id || null}><SessionNavigation.Provider value={open}><WorkspaceControls.Provider value={{ compact: true, find }}><DesktopTitlebar /><div className={`chat-workspace ${!target ? 'manager-only' : ''}`} style={{ height: window.threaddeckDesktop ? 'calc(100dvh - 38px)' : '100dvh', '--chat-sidebar-width': `${Math.max(430, Math.min(width, innerWidth * .4))}px` } as React.CSSProperties}>
    <style>{mobileManagerStyle}</style>
    {target && narrow && drawer && <button className="chat-drawer-backdrop" aria-label="Close sidebar" onClick={() => setDrawer(false)} />}
    {(!target || !narrow && sidebar || narrow && drawer) && <aside ref={manager} className={`chat-manager ${target && narrow ? 'drawer' : ''}`} aria-label="Session manager" {...(target && narrow ? { role: 'dialog', 'aria-modal': true } : {})}>{children}</aside>}
    {target && !narrow && sidebar && <div className="chat-resizer" role="separator" tabIndex={0} aria-label="Resize sidebar" aria-orientation="vertical" aria-valuemin={430} aria-valuemax={Math.floor(innerWidth * .4)} aria-valuenow={Math.min(width, innerWidth * .4)} onPointerDown={event => {
      const element = event.currentTarget; element.setPointerCapture(event.pointerId)
      const move = (e: PointerEvent) => setWidth(Math.max(430, Math.min(innerWidth * .4, e.clientX)))
      const stop = () => { element.removeEventListener('pointermove', move); element.removeEventListener('pointerup', stop); element.removeEventListener('pointercancel', stop) }
      element.addEventListener('pointermove', move); element.addEventListener('pointerup', stop); element.addEventListener('pointercancel', stop)
    }} onKeyDown={e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); setWidth(w => Math.max(430, Math.min(innerWidth * .4, w + (e.key === 'ArrowRight' ? 20 : -20)))) } }} />}
    {selected && <Suspense fallback={<main className="chat-pane"><p className="chat-muted">Loading conversation workspace…</p></main>}><ConversationPane key={selected.session?.id || `new:${selected.project.id}`} target={selected} sidebar={() => narrow ? setDrawer(value => !value) : setSidebar(value => !value)} close={() => setTarget(null)} created={(session, project) => setTarget({ session, project })} markRead={markRead} /></Suspense>}
    {!target && <button className="chat-manager-new" onClick={find}><Plus size={15} />New / find conversation <kbd>Ctrl K</kbd></button>}
    {finder && <SessionFinder sessions={sessions} projects={projects} select={open} create={project => { setTarget({ project }); setFinder(false); setDrawer(false) }} close={() => setFinder(false)} history={() => { setFinder(false); setHistoryOpen(true) }} />}
    {historyOpen && <ConversationSearch close={() => setHistoryOpen(false)} onSelect={hit => {
      const known = sessions.find(session => session.id === hit.id)
      if (known) { open(known); return true }
      const candidates = projects.filter(project => project.name === hit.project)
      if (candidates.length !== 1) return false // Preserve the existing Discord fallback when project names are ambiguous.
      open({ id: hit.id, threadId: hit.threadId, guildId: hit.guildId, title: hit.title, projectId: candidates[0].id, updatedAt: hit.updatedAt, status: 'idle', agentCount: 0 }); return true
    }} />}
  </div></WorkspaceControls.Provider></SessionNavigation.Provider></SelectedSession.Provider>
}
