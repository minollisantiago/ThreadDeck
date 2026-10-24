// THROWAWAY: three transcript structures on one fixture-only route (?variant=A/B/C).
// Question: does the sidebar → read → compact/expanded Vim → switch workflow feel right?
// No Kimaki/OpenCode connection. Persistence deliberately uses an isolated prototype key.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown, CircleAlert, Code2, Download, Expand, FileCode, FileText, Hash, Image, Layers2, Menu, Moon, Network, List, Paperclip, Plus, Search, Settings2, Square, Sun, X } from 'lucide-react'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { basicSetup } from 'codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { vim, getCM } from '@replit/codemirror-vim'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { FilterTabs } from './components/filter-tabs'
import { SessionRow } from './components/session-row'
import { ProjectCollapse } from './components/project-collapse'
import { ProjectUnreadPill } from './components/project-unread-pill'
import { ProjectIslands } from './components/project-islands'
import { StatePanels } from './components/state-panels'
import { palettes, type Palette } from './components/header-controls'
import { darkThemes, lightThemes, type DarkTheme, type LightTheme } from './lib/theme'
import { projectOrder, sessionOrder, stateGroups, visibleProjects, workingCount, type Filter } from './lib/view'
import { isActive, isAttention, type Project, type Session } from '../shared/model'
import dashboardCss from './styles.css?raw'
import './styles.css'
import './chat-workspace.prototype.css'

type FixtureSession = { id: string; project: string; title: string; status: 'idle' | 'working' | 'attention'; age: string }
type Draft = { text: string; cursor: number; anchor?: number }
type Attachment = { id: string; name: string; image?: string; unavailable?: boolean }
type Message = { id: string; role: 'user' | 'assistant'; text: string; time: string; files?: boolean; question?: boolean }
const sessions: FixtureSession[] = [
  { id: 'deck', project: 'ThreadDeck', title: 'A quieter place to work', status: 'attention', age: 'now' },
  { id: 'finder', project: 'ThreadDeck', title: 'Fuzzy conversation search', status: 'working', age: '2m' },
  { id: 'launch', project: 'ThreadDeck', title: 'Windows desktop launcher', status: 'idle', age: '1h' },
  { id: 'canvas', project: 'TsCanvas', title: 'Explore the timeline interaction', status: 'working', age: '4m' },
  { id: 'gas', project: 'NaturalGas', title: 'Review the forecasting baseline', status: 'attention', age: '12m' },
  { id: 'data', project: 'BeautifulData', title: 'Polish the chart annotations', status: 'idle', age: '3h' },
]
const fixtureMessages: Message[] = [
  { id: 'm1', role: 'user', time: '10:42', text: 'Let’s explore a calmer workspace for our agents. Keep the thread manager close, but give the conversation room to breathe.\n\nCan you show me a direction with a real Markdown composer?' },
  { id: 'm2', role: 'assistant', time: '10:43', text: '## A workspace, not another inbox\n\nThe thread manager stays on the left. One conversation takes the rest of the window, with **your unfinished prompt always waiting where you left it**.\n\n- Switch sessions without losing your train of thought.\n- Expand the editor when a prompt needs more room.\n- Keep the same conversation available in Discord.\n\n> The interface should get out of the way when you’re thinking.', files: true },
  { id: 'm3', role: 'user', time: '10:46', text: 'I like that. Make the composer feel like a place to write, not just a textbox. And keep keyboard navigation predictable.' },
  { id: 'm4', role: 'assistant', time: '10:47', text: 'The compact input grows as you write. Press **Ctrl+P, then P** to give the draft the whole conversation pane. Vim mode is available there.\n\n```typescript\nconst workspace = {\n  conversation: "one at a time",\n  drafts: "one per session",\n  execution: "Kimaki → OpenCode",\n}\n```\n\n| While reading | While writing |\n| --- | --- |\n| Stay at your scroll position | Keep your selection |\n| New messages wait below | Drafts survive switching |', question: true },
]
const html = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'"><style>*{box-sizing:border-box}body{margin:0;padding:54px;background:#f3f0e9;color:#242b28;font:16px system-ui}small{letter-spacing:3px;color:#5b7464}h1{font-size:clamp(30px,5vw,60px);font-weight:500;letter-spacing:-2px;max-width:650px;margin:18px 0}p{color:#637067;line-height:1.8;max-width:580px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin:46px 0}.card{background:#fffdf8;border:1px solid #dcded3;border-radius:16px;padding:24px}.card b{font-size:36px;display:block;margin-bottom:10px}.chart{height:180px;border-radius:20px;background:linear-gradient(160deg,#ecf0e5 20%,#96b7a0 21%,#ecf0e5 22%,#ecf0e5 43%,#7ea98c 44%,#ecf0e5 45%,#ecf0e5 65%,#568767 66%,#ecf0e5 67%);border:1px solid #dcded3}@media(max-width:600px){body{padding:24px}.grid{grid-template-columns:1fr}.card b{font-size:24px}}</style></head><body><small>FIELDNOTES / WORKSPACE STUDY</small><h1>Less switching.<br>More thinking.</h1><p>A quiet home for parallel work. Keep the important conversations close and give your next thought some space.</p><div class="grid"><div class="card"><b>06</b>Open conversations</div><div class="card"><b>02</b>Need your attention</div><div class="card"><b>01</b>Place to focus</div></div><div class="chart"></div><p>Static HTML attachment · scripts and network disabled · synthetic content</p></body></html>`
const screenshot = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="720" height="320"><rect width="720" height="320" rx="20" fill="#222329"/><rect x="20" y="20" width="200" height="280" rx="12" fill="#2f3039"/><rect x="242" y="20" width="458" height="280" rx="12" fill="#292a31"/><g fill="#6c687b"><rect x="38" y="50" width="130" height="8" rx="4"/><rect x="38" y="105" width="160" height="38" rx="6"/><rect x="38" y="155" width="160" height="38" rx="6"/><rect x="270" y="55" width="230" height="9" rx="4"/><rect x="270" y="80" width="370" height="8" rx="4"/><rect x="270" y="100" width="320" height="8" rx="4"/></g><rect x="264" y="215" width="410" height="60" rx="10" fill="#393640"/><circle cx="190" cy="124" r="4" fill="#f38eaa"/><text x="270" y="165" fill="#f0dce7" font-family="monospace" font-size="19">A little more room to think.</text></svg>')}`
const key = 'threaddeck:chat-prototype:v1'
function load() {
  try { return JSON.parse(localStorage.getItem(key) || '{}') } catch { return {} }
}
const initial = load()
// Apply the real dashboard's mobile rules to its sidebar container, even on a wide
// desktop. Do not fork its type scale, card styles, connectors or responsive rules.
const mobileDashboardCss = (() => {
  const blocks: string[] = []
  const pattern = /@media\s*\(max-width:\s*(\d+)px\)\s*\{/g
  for (const match of dashboardCss.matchAll(pattern)) {
    let depth = 1, end = match.index! + match[0].length
    const start = end
    while (depth && end < dashboardCss.length) {
      if (dashboardCss[end] === '{') depth++
      if (dashboardCss[end] === '}') depth--
      end++
    }
    const condition = Number(match[1]) >= 600 ? 'min-width:0px' : `max-width:${match[1]}px`
    blocks.push(`@container threaddeck-manager (${condition}) {${dashboardCss.slice(start, end - 1).replace(/(\d+)vw/g, '$1cqw')}}`)
  }
  return blocks.join('\n')
})()
const fixtureNow = Date.now()
const variants = ['A', 'B', 'C'] as const
type Variant = typeof variants[number]
const names = { A: 'Stream', B: 'Turn cards', C: 'Notebook' }
function fuzzy(value: string, query: string) {
  let at = 0
  for (const char of value.toLowerCase()) if (char === query.toLowerCase()[at]) at++
  return at === query.length
}

function Workspace() {
  const [variant, setVariant] = useState<Variant>(() => { const v = new URLSearchParams(location.search).get('variant'); return variants.includes(v as Variant) ? v as Variant : 'A' })
  const [selected, setSelected] = useState<string>(initial.selected || 'deck')
  const session: FixtureSession = selected === 'new' ? { id: 'new', project: 'ThreadDeck', title: 'New conversation', status: 'idle', age: 'draft' } : sessions.find(s => s.id === selected) || sessions[0]
  const [drafts, setDrafts] = useState<Record<string, Draft>>(initial.drafts || { deck: { text: '', cursor: 0 } })
  const [files, setFiles] = useState<Record<string, Attachment[]>>(() => Object.fromEntries(Object.entries(initial.files || {}).map(([id, list]) => [id, (list as Attachment[]).map(f => ({ id: f.id, name: f.name, unavailable: true }))])))
  const [expanded, setExpanded] = useState(false)
  const [vimEnabled, setVimEnabled] = useState(initial.vim !== false)
  const [vimMode, setVimMode] = useState('NORMAL')
  const [sidebar, setSidebar] = useState(initial.sidebar !== false)
  const [managerOnly, setManagerOnly] = useState(false)
  const [width, setWidth] = useState<number>(Number(initial.width) || 430)
  const [narrow, setNarrow] = useState(innerWidth < 1080)
  const [drawer, setDrawer] = useState(false)
  const [filter, setFilter] = useState('')
  const [sessionFilter, setSessionFilter] = useState<Filter>('active')
  const [grouping, setGrouping] = useState<'project' | 'state'>('project')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [appearance, setAppearance] = useState<'dark' | 'light'>(initial.appearance || 'dark')
  const [palette, setPalette] = useState<Palette>(initial.palette || 'pink')
  const [darkTheme, setDarkTheme] = useState<DarkTheme>(initial.darkTheme || 'original')
  const [lightTheme, setLightTheme] = useState<LightTheme>(initial.lightTheme || 'original')
  const [design, setDesign] = useState<'classic' | 'islands'>(initial.design || 'classic')
  const [finder, setFinder] = useState(false)
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const [preview, setPreview] = useState(false)
  const [source, setSource] = useState(false)
  const [imageOpen, setImageOpen] = useState(false)
  const [help, setHelp] = useState(false)
  const [messages, setMessages] = useState<Record<string, Message[]>>({})
  const [queue, setQueue] = useState<Record<string, string[]>>({})
  const [working, setWorking] = useState<Record<string, boolean>>({ finder: true, canvas: true })
  const liveSessions = sessions.map(s => ({ ...s, status: working[s.id] ? 'working' as const : s.status === 'working' ? 'idle' as const : s.status }))
  const [outcome, setOutcome] = useState<'submitted' | 'failed' | 'unknown'>('submitted')
  const [notice, setNotice] = useState('')
  const [answered, setAnswered] = useState<Record<string, string>>({})
  const [newMessages, setNewMessages] = useState(false)
  const [unread, setUnread] = useState<Record<string, boolean>>({ deck: true, gas: true })
  const input = useRef<HTMLTextAreaElement>(null)
  const editorMount = useRef<HTMLDivElement>(null)
  const editor = useRef<EditorView | null>(null)
  const upload = useRef<HTMLInputElement>(null)
  const transcript = useRef<HTMLDivElement>(null)
  const scrollPositions = useRef<Record<string, number>>({})
  const following = useRef(true)
  const dialog = useRef<HTMLDialogElement>(null)
  const appearancePanel = useRef<HTMLDivElement>(null)
  const optionsPanel = useRef<HTMLDivElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const chord = useRef(0)
  const draftRef = useRef(drafts)
  draftRef.current = drafts
  const draft = drafts[session.id] || { text: '', cursor: 0 }
  const attached = files[session.id] || []
  const busy = Boolean(working[session.id])
  const currentMessages = messages[session.id] || (session.id === 'new' ? [] : session.id === 'deck' ? fixtureMessages : [
    { id: `${session.id}-1`, role: 'user' as const, time: '10:30', text: `Let's work on **${session.title.toLowerCase()}**. Keep the changes focused and explain the tradeoffs.` },
    { id: `${session.id}-2`, role: 'assistant' as const, time: '10:31', text: `## ${session.title}\n\nI’ve reviewed the current direction. Here’s the approach:\n\n1. Keep the existing behavior intact.\n2. Make the smallest useful change.\n3. Validate the result before moving on.\n\nThis is a synthetic conversation. Try writing a draft, switching sessions with **Ctrl+K**, and coming back.` },
  ])
  const hits = liveSessions.filter(s => fuzzy(`${s.project} ${s.title}`, query))

  function updateDraft(text: string, cursor = text.length, anchor = cursor) { setDrafts(d => ({ ...d, [session.id]: { text, cursor, anchor } })) }
  function focusComposer() {
    for (const panel of [appearancePanel.current, optionsPanel.current]) if (panel?.matches(':popover-open')) panel.hidePopover()
    setManagerOnly(false); setPreview(false); setDrawer(false)
    requestAnimationFrame(() => { if (editor.current) editor.current.focus(); else { input.current?.focus(); const d = draftRef.current[session.id]; if (d) { const anchor = d.anchor ?? d.cursor; input.current?.setSelectionRange(Math.min(anchor, d.cursor), Math.max(anchor, d.cursor), anchor > d.cursor ? 'backward' : 'forward') } } })
  }
  function toggleExpanded() { setExpanded(v => !v); setPreview(false); setManagerOnly(false); setDrawer(false); requestAnimationFrame(focusComposer) }
  function switchSession(id: string) {
    if (transcript.current) scrollPositions.current[session.id] = transcript.current.scrollTop
    setSelected(id); setFinder(false); setQuery(''); setDrawer(false); setManagerOnly(false); setNotice(''); setNewMessages(false)
    setUnread(u => ({ ...u, [id]: false }))
  }
  function changeVariant(next: Variant) {
    setVariant(next); const url = new URL(location.href); url.searchParams.set('variant', next); history.replaceState(null, '', url)
  }
  function submit(intent: 'send' | 'queue') {
    if (!draft.text.trim() && !attached.length) return
    if (attached.some(f => f.unavailable)) { setNotice('Reattach unavailable files before submitting this fixture.'); return }
    if (outcome !== 'submitted') { setNotice(outcome === 'unknown' ? 'Delivery uncertain · draft retained. Reconcile status before any resend. No real submission occurred.' : 'Published in Discord, harness rejected · draft retained. This is a simulated partial failure.'); return }
    if (intent === 'queue') {
      setQueue(q => ({ ...q, [session.id]: [...(q[session.id] || []), draft.text || attached.map(f => f.name).join(', ')] }))
      setNotice('Fixture queued · no prompt sent to Kimaki.')
    } else {
      setMessages(m => ({ ...m, [session.id]: [...currentMessages, { id: crypto.randomUUID(), role: 'user', time: 'now', text: `${draft.text}${attached.length ? `\n\nAttachments: ${attached.map(f => f.name).join(', ')}` : ''}` }] }))
      setWorking(w => ({ ...w, [session.id]: true })); setNotice('Fixture accepted · no prompt sent to Kimaki.')
    }
    updateDraft(''); setFiles(f => ({ ...f, [session.id]: [] }))
    editor.current?.dispatch({ changes: { from: 0, to: editor.current.state.doc.length, insert: '' } })
  }
  function simulateReply() {
    setMessages(m => ({ ...m, [session.id]: [...currentMessages, { id: crypto.randomUUID(), role: 'assistant', time: 'now', text: 'The fixture update is ready. Your reading position and unfinished draft should remain undisturbed. **No agent was contacted.**' }] }))
    setWorking(w => ({ ...w, [session.id]: false }))
    if (preview || !following.current) { setNewMessages(true); setUnread(u => ({ ...u, [session.id]: true })) }
  }

  useEffect(() => {
    const onResize = () => setNarrow(innerWidth < 1080)
    window.addEventListener('resize', onResize); return () => window.removeEventListener('resize', onResize)
  }, [])
  useEffect(() => {
    Object.assign(document.documentElement.dataset, { appearance, palette, darkTheme, lightTheme })
  }, [appearance, palette, darkTheme, lightTheme])
  useEffect(() => {
    if (!drawer || !narrow) return
    const previous = document.activeElement
    document.querySelector<HTMLButtonElement>('.drawer button')?.focus()
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus() }
  }, [drawer, narrow])
  useEffect(() => {
    if (preview) document.querySelector<HTMLElement>('.preview-document, .source-view')?.focus({ preventScroll: true })
  }, [preview, source])
  useEffect(() => {
    // Namespaced scratch storage intentionally checks draft/reload behavior; no real preferences.
    try { localStorage.setItem(key, JSON.stringify({ drafts, files: Object.fromEntries(Object.entries(files).map(([id, items]) => [id, items.map(f => ({ id: f.id, name: f.name }))])), selected, width, vim: vimEnabled, sidebar, appearance, palette, darkTheme, lightTheme, design })) } catch { /* prototype storage may be unavailable */ }
  }, [drafts, files, selected, width, vimEnabled, sidebar, appearance, palette, darkTheme, lightTheme, design])
  useLayoutEffect(() => {
    const el = transcript.current
    if (!el) return
    el.scrollTop = scrollPositions.current[session.id] ?? el.scrollHeight
    following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90
  }, [session.id, expanded, preview, managerOnly])
  useLayoutEffect(() => {
    if (transcript.current && following.current) transcript.current.scrollTop = transcript.current.scrollHeight
  }, [messages])
  useLayoutEffect(() => {
    if (input.current) { input.current.style.height = 'auto'; input.current.style.height = `${Math.min(180, Math.max(62, input.current.scrollHeight))}px` }
  }, [draft.text, expanded, session.id])
  useLayoutEffect(() => {
    const d = draftRef.current[session.id]
    if (!d || !input.current) return
    const anchor = d.anchor ?? d.cursor
    input.current.setSelectionRange(Math.min(anchor, d.cursor), Math.max(anchor, d.cursor), anchor > d.cursor ? 'backward' : 'forward')
  }, [session.id, expanded, preview])
  useLayoutEffect(() => {
    if (!expanded || preview || managerOnly || !editorMount.current) return
    const d = draftRef.current[session.id] || { text: '', cursor: 0 }
    const view = new EditorView({ parent: editorMount.current, state: EditorState.create({ doc: d.text,
      selection: { anchor: Math.min(d.anchor ?? d.cursor, d.text.length), head: Math.min(d.cursor, d.text.length) },
      extensions: [ ...(vimEnabled ? [vim()] : []), basicSetup, markdown(), EditorView.lineWrapping,
        EditorView.theme({ '&': { height: '100%', background: 'transparent', color: 'var(--text)' }, '.cm-content': { fontFamily: 'var(--font)', fontSize: '14px', lineHeight: '1.9', padding: '22px 0' }, '.cm-scroller': { overflow: 'auto' }, '.cm-gutters': { background: 'transparent', color: 'var(--subtle)', border: 'none' }, '.cm-activeLine, .cm-activeLineGutter': { background: 'color-mix(in srgb, var(--row) 40%, transparent)' }, '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': { background: 'color-mix(in srgb, var(--accent) 20%, transparent) !important' }, '.cm-cursor': { borderLeftColor: 'var(--accent)' } }, { dark: appearance === 'dark' }),
        EditorView.updateListener.of(update => { if (update.docChanged || update.selectionSet) setDrafts(ds => ({ ...ds, [session.id]: { text: update.state.doc.toString(), cursor: update.state.selection.main.head, anchor: update.state.selection.main.anchor } })) }),
      ] }) })
    editor.current = view
    const cm = getCM(view)
    const onMode = (event: { mode: string }) => setVimMode(event.mode.toUpperCase())
    if (vimEnabled) cm?.on('vim-mode-change', onMode)
    setVimMode(vimEnabled ? 'NORMAL' : 'TEXT'); view.focus()
    return () => { if (vimEnabled) cm?.off('vim-mode-change', onMode); view.destroy(); editor.current = null }
  }, [session.id, expanded, vimEnabled, preview, managerOnly, appearance])
  useEffect(() => {
    if (!finder && !help && !imageOpen) return
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog.current?.showModal(); search.current?.focus()
    return () => { returnFocus.current?.focus() }
  }, [finder, help, imageOpen])
  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if (event.isComposing || event.repeat) return
      const ctrl = event.ctrlKey || event.metaKey
      const p = event.key.toLowerCase() === 'p'
      const second = p && !event.altKey && !event.shiftKey && chord.current > 0 && performance.now() - chord.current < 550
      if (!finder && !help && !imageOpen && second) { event.preventDefault(); event.stopPropagation(); chord.current = 0; toggleExpanded(); return }
      if (!finder && !help && !imageOpen && ctrl && p && !event.shiftKey && !event.altKey) { event.preventDefault(); event.stopPropagation(); chord.current = performance.now(); focusComposer(); return }
      chord.current = 0
      if (ctrl && event.key.toLowerCase() === 'k') { event.preventDefault(); setHelp(false); setImageOpen(false); setFinder(f => !f); setQuery(''); setIndex(0); return }
      if (ctrl && event.key === 'Tab' && 'threaddeckDesktop' in window) { event.preventDefault(); setFinder(true); setQuery(''); setIndex(0); return }
      if (ctrl && event.key === 'Enter' && !finder && !help && !imageOpen && !preview) { event.preventDefault(); event.stopPropagation(); submit(event.shiftKey ? 'queue' : 'send'); return }
      if (event.key === 'Escape') {
        if (document.querySelector('[popover]:popover-open')) return
        if (finder || help || imageOpen) { event.preventDefault(); setFinder(false); setHelp(false); setImageOpen(false) }
        else if (preview) { event.preventDefault(); setPreview(false) }
        else if (drawer) { event.preventDefault(); setDrawer(false) }
        return
      }
      const target = event.target as HTMLElement
      const editable = Boolean(target.closest('input,textarea,select,[contenteditable],.cm-editor,dialog'))
      if (!editable && event.code === 'Space' && !ctrl && !event.altKey && !target.closest('button,a')) {
        event.preventDefault()
        const now = performance.now()
        if (now - lastSpace < 350) { setFinder(true); setQuery(''); setIndex(0); lastSpace = 0 } else lastSpace = now
      }
      if (import.meta.env.MODE === 'prototype' && !editable && !ctrl && !event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
        const at = variants.indexOf(variant); changeVariant(variants[(at + (event.key === 'ArrowRight' ? 1 : 2)) % 3])
      }
    }
    let lastSpace = 0
    window.addEventListener('keydown', keydown, true)
    return () => window.removeEventListener('keydown', keydown, true)
  })

  function rememberScroll() {
    const el = transcript.current
    if (!el) return
    scrollPositions.current[session.id] = el.scrollTop
    following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90
    if (following.current) { setNewMessages(false); setUnread(u => u[session.id] ? { ...u, [session.id]: false } : u) }
  }
  function beginDrag(event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    const move = (e: PointerEvent) => setWidth(Math.max(430, Math.min(innerWidth * .4, innerWidth - 460, e.clientX)))
    const target = event.currentTarget
    const finish = () => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', finish); target.removeEventListener('pointercancel', finish) }
    target.addEventListener('pointermove', move); target.addEventListener('pointerup', finish); target.addEventListener('pointercancel', finish)
  }
  const unreadIds = new Set(Object.keys(unread).filter(id => unread[id]))
  const projects: Project[] = [...new Set(sessions.map(s => s.project))].map(name => ({
    id: name, name, directory: `/fixture/${name}`, sessions: liveSessions.filter(s => s.project === name).map(s => ({
      id: s.id, title: s.title, projectId: name, threadId: `10000000000000000${sessions.findIndex(item => item.id === s.id)}`,
      guildId: '100000000000000000', status: s.status === 'attention' ? 'input' : s.status,
      agentCount: s.status === 'working' ? 1 : 0, updatedAt: fixtureNow - (s.age === 'now' ? 0 : parseInt(s.age) * (s.age.endsWith('h') ? 3_600_000 : 60_000)),
    })),
  }))
  const shown = projectOrder(visibleProjects(projects, filter, sessionFilter, fixtureNow, true, unreadIds), true, unreadIds)
  const groups = stateGroups(shown, true, unreadIds)
  const markRead = (s: Session) => setUnread(u => ({ ...u, [s.id]: false }))
  const markProjectRead = (id: string) => setUnread(u => Object.fromEntries(Object.entries(u).map(([sessionId, value]) => [sessionId, sessions.some(s => s.id === sessionId && s.project === id) ? false : value])))
  const toggleProject = (id: string) => setCollapsed(c => ({ ...c, [id]: !c[id] }))
  function openPopover(panel: HTMLDivElement | null, trigger: HTMLButtonElement) {
    if (!panel) return
    const rect = trigger.getBoundingClientRect()
    panel.style.left = `${Math.max(12, rect.right - Math.min(340, rect.right - 12))}px`
    panel.style.top = `${rect.bottom + 8}px`
    panel.togglePopover()
  }
  function sidebarClick(event: React.MouseEvent | React.KeyboardEvent) {
    if (event.type === 'keydown' && (event as React.KeyboardEvent).key !== 'Enter') return
    const target = event.target as HTMLElement
    const link = target.closest('a')
    const row = target.closest('.session-row')
    if (link) { event.preventDefault(); event.stopPropagation() }
    if (!row) return
    if (target.closest('.status-unread') || target.closest('[role="menu"]')) return
    if (target.closest('.browser-link')) { setNotice('Fixture only · no Discord thread is opened.'); return }
    const title = row.querySelector('.session-title')?.textContent
    const item = sessions.find(s => s.title === title)
    if (item) { event.preventDefault(); event.stopPropagation(); switchSession(item.id) }
  }
  const actualWidth = Math.min(width, innerWidth * .4, innerWidth - 460)
  const sidebarContent = <div className="app-shell" data-design={design} onClickCapture={sidebarClick} onKeyDownCapture={sidebarClick}>
    <header className="page-header">
      <div className="identity"><div className="brand-icon"><Layers2 aria-hidden="true" /></div><div><p className="eyebrow">YOUR AGENT SWITCHBOARD</p><h1>ThreadDeck<span className="live-label">DEMO</span></h1></div></div>
      <div className="header-controls">
        <Button variant="outline" size="icon" className="mobile-menu-toggle" aria-label="App controls" onClick={e => openPopover(appearancePanel.current, e.currentTarget)}><Menu /></Button>
        <div ref={appearancePanel} className="appearance-controls" popover="auto" role="group" aria-label="Appearance and links">
          <div className="palette-picker" role="group" aria-label="Accent color">{palettes.map(p => <button key={p} className={`palette-swatch palette-${p}`} aria-label={`${p} accent`} aria-pressed={palette === p} onClick={() => setPalette(p)}>{palette === p ? '✓' : ''}</button>)}</div>
          <div className="theme-picker" role="group" aria-label="Theme background">{(appearance === 'dark' ? darkThemes : lightThemes).map(theme => <button key={theme.value} className={`theme-swatch theme-${appearance === 'dark' ? 'dark-' : ''}${theme.value}`} aria-label={`${theme.label} theme`} aria-pressed={(appearance === 'dark' ? darkTheme : lightTheme) === theme.value} onClick={() => appearance === 'dark' ? setDarkTheme(theme.value as DarkTheme) : setLightTheme(theme.value as LightTheme)}>{(appearance === 'dark' ? darkTheme : lightTheme) === theme.value ? '✓' : ''}</button>)}</div>
          <div className="header-actions"><Button variant="outline" size="icon" aria-label={`Switch to ${design === 'classic' ? 'islands' : 'list'} view`} onClick={() => setDesign(d => d === 'classic' ? 'islands' : 'classic')}>{design === 'classic' ? <Network /> : <List />}</Button><Button variant="outline" size="icon" aria-label={`Switch to ${appearance === 'dark' ? 'light' : 'dark'} mode`} onClick={() => setAppearance(a => a === 'dark' ? 'light' : 'dark')}>{appearance === 'dark' ? <Sun /> : <Moon />}</Button></div>
        </div>
        <button className="connection-trigger" aria-label={managerOnly ? 'Open chat' : 'Close sidebar'} onClick={() => { if (managerOnly) setManagerOnly(false); else if (narrow) setDrawer(false); else setSidebar(false) }}><ChevronLeft size={14} /></button>
      </div>
    </header>
    <div className="overview"><div className="overview-counts">{[
      { kind: 'working', count: projects.reduce((sum, p) => sum + workingCount(p.sessions), 0), label: 'working' },
      { kind: 'attention', count: projects.flatMap(p => p.sessions).filter(s => isAttention(s.status) || unreadIds.has(s.id)).length, label: 'attention' },
      { kind: 'projects', count: projects.filter(p => p.sessions.some(s => isActive(s) || unreadIds.has(s.id))).length, label: 'active' },
    ].map(({ kind, count, label }) => <span key={kind} className={`overview-pill overview-pill-${kind}`} data-count-state={count > 0 ? 'positive' : 'zero'}><strong>{count}</strong><span>{label}</span></span>)}</div></div>
    <div className="toolbar">
      <div className="search-field"><Search /><Input type="search" value={filter} onChange={e => setFilter(e.target.value)} placeholder="Search projects or sessions…" aria-label="Search projects or sessions" /><div className="search-shortcuts"><button aria-label="Find a conversation" title="Ctrl+K" onClick={() => { setFinder(true); setQuery(''); setIndex(0) }}><kbd>/</kbd></button></div></div>
      <Button variant="outline" size="icon" className="thread-options-toggle" aria-label="Thread list options" onClick={e => openPopover(optionsPanel.current, e.currentTarget)}><Settings2 /></Button>
      <div ref={optionsPanel} className="thread-list-options" popover="auto" role="group" aria-label="Thread list options"><p className="thread-options-heading">Group threads</p><div className="filter-group grouping-control" role="group" aria-label="Group threads">{(['project', 'state'] as const).map(value => <Button key={value} variant="ghost" className={grouping === value ? 'filter-selected' : ''} aria-pressed={grouping === value} onClick={() => setGrouping(value)}>By {value}</Button>)}</div><Button variant="outline" className="mark-all-read" disabled={!unreadIds.size} onClick={() => setUnread({})}>Mark all as read</Button></div>
      <FilterTabs filter={sessionFilter} setFilter={setSessionFilter} />
    </div>
    <div className="section-caption"><span>{grouping === 'project' ? 'PROJECTS' : 'STATES'} <span className="caption-count">{String(grouping === 'project' ? shown.length : groups.length).padStart(2, '0')}</span></span><button className="new-fixture" aria-label="Create fixture conversation" title="New fixture conversation" onClick={() => { switchSession('new'); setNotice('New conversation draft · fixture only. No Discord thread created.') }}><Plus size={14} /></button></div>
    <div className="project-list">
      {grouping === 'state' && <StatePanels groups={groups} verified now={fixtureNow} unread={unreadIds} markRead={markRead} graphical={design === 'islands'} />}
      {grouping === 'project' && design === 'islands' && <ProjectIslands projects={shown} verified now={fixtureNow} unread={unreadIds} markRead={markRead} markProjectRead={markProjectRead} collapsed={collapsed} toggle={toggleProject} />}
      {grouping === 'project' && design === 'classic' && shown.map(project => {
        const working = workingCount(project.sessions), attention = project.sessions.filter(s => isAttention(s.status)).length
        const count = project.sessions.filter(s => unreadIds.has(s.id)).length
        const closed = collapsed[project.id] ?? false
        return <section key={project.id} className={`project-panel ${working || attention || count ? 'project-active' : ''}`} aria-labelledby={`heading-${project.id}`}>
          <div className="project-heading" data-connected={!closed && project.sessions.length > 0}>
            <button className="project-toggle" type="button" title={project.name} onClick={() => toggleProject(project.id)} aria-expanded={!closed} aria-controls={`sessions-${project.id}`}><span className="sr-only">{project.name} {project.sessions.length} sessions</span></button>
            <ChevronDown className={`chevron ${closed ? 'is-closed' : ''}`} aria-hidden="true" /><Hash className="project-channel-icon" aria-hidden="true" /><span className="project-name" id={`heading-${project.id}`} title={project.name}>{project.name}</span>
            <span className="project-pills"><span className="project-total">{project.sessions.length} {project.sessions.length === 1 ? 'session' : 'sessions'}</span>{attention > 0 && <span className="project-attention"><CircleAlert />{attention} needs attention</span>}<ProjectUnreadPill count={count} projectName={project.name} describedBy={`heading-${project.id}`} className="project-unread" markRead={() => markProjectRead(project.id)} /></span>
            {(working > 0 || !attention && !count) && <span className="project-summary">{working ? <span className="working-summary"><i />{working} working</span> : 'No working threads'}</span>}
          </div>
          <ProjectCollapse id={`sessions-${project.id}`} collapsed={closed}><div className="project-sessions">{sessionOrder(project.sessions, true).map(s => <SessionRow key={s.id} session={s} verified now={fixtureNow} unread={unreadIds.has(s.id)} markRead={markRead} />)}</div></ProjectCollapse>
        </section>
      })}
      {!shown.length && <div className="empty-state"><Layers2 /><h2>No matching sessions</h2><p>Try another search or switch to all sessions.</p></div>}
    </div>
    <footer><span><span className="footer-dot" />LOCAL · FIXTURE DATA</span><button onClick={() => setHelp(true)}>Shortcuts</button></footer>
  </div>
  function messageView(message: Message) {
    return <article key={message.id} className={`message ${message.role}`}>
      <div className="message-meta"><span className={`avatar ${message.role}`}>{message.role === 'assistant' ? <Layers2 size={13} /> : 'S'}</span><strong>{message.role === 'assistant' ? 'Assistant' : 'You'}{message.role === 'user' && <small>via ThreadDeck</small>}</strong><time>{message.time}</time></div>
      {message.role === 'assistant' && <details className="activity"><summary><Check size={12} />Reviewed 3 files · 2 tools<ChevronDown size={12} /></summary><p>Synthetic activity: inspected layout, checked keyboard behavior. No tools actually ran.</p></details>}
      <div className="markdown"><Markdown remarkPlugins={[remarkGfm]} components={{ a: ({ children }) => <span className="mock-link">{children}</span>, pre: ({ children }) => <div className="code-block"><button title="Copy code" onClick={e => void navigator.clipboard?.writeText(e.currentTarget.parentElement?.querySelector('pre')?.textContent || '')}>Copy</button><pre>{children}</pre></div> }}>{message.text}</Markdown></div>
      {message.files && <div className="attachment-grid"><button className="screenshot-card" onClick={() => setImageOpen(true)}><img src={screenshot} alt="Synthetic workspace screenshot" /><span><Image size={13} />workspace-study.svg <small>720 × 320</small></span></button><div className="html-card"><div className="file-icon"><FileCode size={23} /></div><strong>workspace-study.html</strong><small>Static HTML · sandboxed preview</small><button onClick={() => { scrollPositions.current[session.id] = transcript.current?.scrollTop || 0; setPreview(true); setSource(false) }}>Open preview <ArrowRight size={13} /></button></div></div>}
      {message.question && <div className="question"><span><i className="dot attention" />DESIGN CHECKPOINT · FIXTURE</span><strong>{answered[session.id] ? `Selected: ${answered[session.id]}` : 'Which composer direction should we explore?'}</strong><div>{['Keep it compact', 'Give writing more space'].map(label => <button key={label} disabled={Boolean(answered[session.id])} onClick={() => setAnswered(a => ({ ...a, [session.id]: label }))}>{answered[session.id] === label && <Check size={12} />}{label}</button>)}</div></div>}
    </article>
  }
  const transcriptContent = variant === 'B' ? <div className="turn-cards">{currentMessages.reduce<Message[][]>((turns, message) => { if (message.role === 'user' || !turns.length) turns.push([message]); else turns[turns.length - 1].push(message); return turns }, []).map((turn, i) => <section key={turn[0].id} className="turn-card"><div className="turn-number">TURN {String(i + 1).padStart(2, '0')}</div>{turn.map(messageView)}</section>)}</div> : variant === 'C' ? <div className="notebook"><div className="notebook-heading"><small>CONVERSATION NOTES / {session.project.toUpperCase()}</small><h1>{session.title}</h1><p>A continuous reading surface. Prompts are margin notes; answers are the document.</p></div>{currentMessages.map(messageView)}</div> : <div className="stream">{currentMessages.map(messageView)}</div>

  return <div className={`workspace variant-${variant} ${managerOnly ? 'manager-only' : ''}`} style={{ '--sidebar-width': `${actualWidth}px` } as CSSProperties}>
    <style>{mobileDashboardCss}{`.manager .session-row:has(.session-title[title="${CSS.escape(session.title)}"]) { background: var(--row); box-shadow: inset 2px 0 var(--accent); }`}</style>
    <div className="fixture-banner"><span><i />INTERACTIVE PROTOTYPE</span><span>Synthetic conversations · no agent connected</span><button onClick={() => { setManagerOnly(v => !v); setDrawer(false) }}>{managerOnly ? 'Open conversation' : 'Manager only'}</button><button onClick={() => setHelp(true)}>Shortcuts</button></div>
    <div className="workspace-body">
      {(managerOnly || (!narrow && sidebar)) && <aside className="manager">{sidebarContent}</aside>}
      {!managerOnly && !narrow && sidebar && <div className="resize-handle" role="separator" tabIndex={0} aria-label="Resize session sidebar" aria-orientation="vertical" aria-valuemin={430} aria-valuemax={Math.floor(innerWidth * .4)} aria-valuenow={Math.round(actualWidth)} onPointerDown={beginDrag} onKeyDown={e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); setWidth(w => Math.max(430, Math.min(innerWidth * .4, w + (e.key === 'ArrowRight' ? 20 : -20)))) } }}><span /></div>}
      {!managerOnly && <main className="conversation">
        <header className="conversation-header"><button className="icon" aria-label="Toggle session sidebar" onClick={() => narrow ? setDrawer(v => !v) : setSidebar(v => !v)}><Menu size={18} /></button><div><span>{session.project}<ChevronRight size={11} />{preview ? 'HTML attachment' : expanded ? 'Draft editor' : 'Conversation'}</span><strong>{session.title}</strong></div><span className={`status-pill ${busy ? 'working' : 'idle'}`}><i className={`dot ${busy ? 'working' : 'idle'}`} />{busy ? 'Working' : 'Ready'}</span><button className="icon" aria-label="Find a session" onClick={() => { setFinder(true); setQuery('') }}><Search size={17} /></button></header>
        {preview ? <section className="preview"><div className="preview-toolbar"><button onClick={() => setPreview(false)}><ArrowLeft size={14} />Back to chat <kbd>Esc</kbd></button><strong>workspace-study.html</strong><button onClick={() => setSource(v => !v)}><Code2 size={14} />{source ? 'Preview' : 'Source'}</button><a href={`data:text/html;charset=utf-8,${encodeURIComponent(html)}`} download="workspace-study.html"><Download size={14} />Download</a></div>{source ? <pre className="source-view" tabIndex={0}>{html}</pre> : <div className="preview-document" tabIndex={0} aria-label="Static HTML preview; Escape returns to chat"><iframe title="Sandboxed HTML fixture preview" inert tabIndex={-1} sandbox="" referrerPolicy="no-referrer" srcDoc={html} /></div>}<footer>Static sandbox · scripts, network and parent access disabled</footer></section> : <>
          {!expanded && <div ref={transcript} className="transcript" tabIndex={0} aria-label="Conversation messages" onScroll={rememberScroll}>{transcriptContent}{newMessages && <button className="new-messages" onClick={() => { transcript.current?.scrollTo({ top: transcript.current.scrollHeight, behavior: 'smooth' }); setNewMessages(false); setUnread(u => ({ ...u, [session.id]: false })) }}>New messages <ArrowDown size={13} /></button>}</div>}
          <section className={`composer-area ${expanded ? 'expanded' : ''}`} aria-label={expanded ? 'Expanded prompt editor' : 'Prompt composer'}>
            {expanded && <div className="editor-heading"><div><FileText size={17} /><span>prompt.md<small>{session.title}</small></span></div><button onClick={toggleExpanded}><ChevronDown size={14} />Back to chat <kbd>Ctrl P · P</kbd></button></div>}
            {(queue[session.id] || []).length > 0 && <div className="queued"><small>QUEUED FIXTURE PROMPTS</small>{queue[session.id].map((text, i) => <div key={i}><span>{text}</span><button onClick={() => { if (draft.text.trim()) { setNotice('Keep or clear the current draft before editing a queued fixture.'); return } updateDraft(text); editor.current?.dispatch({ changes: { from: 0, to: editor.current.state.doc.length, insert: text } }); setQueue(q => ({ ...q, [session.id]: q[session.id].filter((_, n) => n !== i) })); focusComposer() }}>Edit</button><button aria-label="Remove queued prompt" onClick={() => setQueue(q => ({ ...q, [session.id]: q[session.id].filter((_, n) => n !== i) }))}><X size={12} /></button></div>)}</div>}
            <div className="composer-box">
              {expanded ? <div ref={editorMount} className="editor-mount" /> : <textarea ref={input} aria-label="Write a prompt" placeholder="A thought, a question, a next step…" value={draft.text} onChange={e => updateDraft(e.target.value, e.target.selectionStart)} onSelect={e => { const el = e.currentTarget; const head = el.selectionDirection === 'backward' ? el.selectionStart : el.selectionEnd; const anchor = el.selectionDirection === 'backward' ? el.selectionEnd : el.selectionStart; if (head !== draft.cursor || anchor !== (draft.anchor ?? draft.cursor)) updateDraft(el.value, head, anchor) }} />}
              {attached.length > 0 && <div className="attached">{attached.map(f => <span key={f.id} className={f.unavailable ? 'missing' : ''}><Paperclip size={12} />{f.name}{f.unavailable && ' · reattach'}<button aria-label={`Remove ${f.name}`} onClick={() => setFiles(fs => ({ ...fs, [session.id]: attached.filter(item => item.id !== f.id) }))}><X size={11} /></button></span>)}</div>}
              <div className="composer-toolbar"><button className="icon" aria-label="Attach files" onClick={() => upload.current?.click()}><Paperclip size={17} /></button><input ref={upload} type="file" multiple hidden onChange={e => { const incoming = [...(e.target.files || [])].map(file => ({ id: crypto.randomUUID(), name: file.name })); setFiles(fs => ({ ...fs, [session.id]: [...attached, ...incoming] })); e.target.value = '' }} /><span className="composer-model">Build <ChevronsUpDown size={11} /><span>fixture model</span></span><div className="toolbar-spacer" />{expanded && <button className={`vim-toggle ${vimEnabled ? 'enabled' : ''}`} onClick={() => setVimEnabled(v => !v)}>Vim {vimEnabled ? 'on' : 'off'}</button>}<button className="icon" aria-label={expanded ? 'Restore compact composer' : 'Expand composer'} title="Ctrl+P, then P" onClick={toggleExpanded}><Expand size={16} /></button>{busy && <button className="interrupt" onClick={() => { if (confirm('Fixture stop also clears queued prompts. Stop?')) { setWorking(w => ({ ...w, [session.id]: false })); setQueue(q => ({ ...q, [session.id]: [] })); setNotice('Fixture stopped and queue cleared. No agent contacted.') } }}><Square size={11} />Stop</button>}<button className="send" disabled={!draft.text.trim() && !attached.length} onClick={() => submit(busy ? 'queue' : 'send')}>{busy ? 'Queue' : 'Send'}<ArrowUp size={15} /></button></div>
            </div>
            <div className="composer-foot"><span>{expanded ? <><i className="mode-dot" />{vimMode}<span className="word-count">{draft.text.trim() ? draft.text.trim().split(/\s+/).length : 0} words</span></> : <><kbd>Ctrl P · P</kbd> expand editor</>}</span><span>Draft saved locally · prototype</span>{busy && <button onClick={() => submit('send')}>Send now / interrupt</button>}</div>
            {notice && <div className={`delivery-notice ${outcome}`} role="status">{notice}<button aria-label="Dismiss delivery notice" onClick={() => setNotice('')}><X size={12} /></button></div>}
          </section>
        </>}
        <div className="simulation"><span>FIXTURE LAB</span><select aria-label="Simulated send outcome" value={outcome} onChange={e => setOutcome(e.target.value as typeof outcome)}><option value="submitted">Accepted</option><option value="failed">Publication only / harness failed</option><option value="unknown">Delivery uncertain</option></select><button onClick={simulateReply}>Simulate reply</button><button onClick={() => setWorking(w => ({ ...w, [session.id]: !busy }))}>{busy ? 'Set idle' : 'Set working'}</button></div>
      </main>}
    </div>
    {narrow && drawer && !managerOnly && <div className="drawer-shade" role="dialog" aria-modal="true" aria-label="Session manager" onClick={() => setDrawer(false)} onKeyDown={e => {
      if (e.key !== 'Tab') return
      const controls = [...e.currentTarget.querySelectorAll<HTMLElement>('button,input')]
      const first = controls[0], last = controls.at(-1)
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
    }}><aside className="manager drawer" onClick={e => e.stopPropagation()}>{sidebarContent}</aside></div>}
    {(finder || help || imageOpen) && <dialog ref={dialog} className={imageOpen ? 'image-dialog' : 'finder'} onCancel={e => { e.preventDefault(); setFinder(false); setHelp(false); setImageOpen(false) }} onClick={e => { if (e.target === dialog.current) { setFinder(false); setHelp(false); setImageOpen(false) } }}>
      <button className="dialog-close icon" aria-label="Close dialog" onClick={() => { setFinder(false); setHelp(false); setImageOpen(false) }}><X size={18} /></button>
      {imageOpen ? <><img src={screenshot} alt="Enlarged synthetic workspace screenshot" /><p>workspace-study.svg · synthetic screenshot</p></> : help ? <><h2>Find your flow.</h2><p>Vim lives in the expanded editor. Everywhere else is ordinary keyboard navigation.</p><dl><dt>Focus composer</dt><dd>Ctrl P</dd><dt>Expand / restore editor</dt><dd>Ctrl P, then P</dd><dt>Session finder</dt><dd>Ctrl K / double Space</dd><dt>Desktop finder</dt><dd>Ctrl Tab</dd><dt>Send / queue</dt><dd>Ctrl Enter / Ctrl Shift Enter</dd><dt>Leave HTML preview</dt><dd>Escape</dd></dl><p className="fine-print">Only synthetic data. Drafts/preferences use isolated prototype storage. Undo history, attachment bytes and simulation outcomes are not persisted.</p><button className="reset" onClick={() => { localStorage.removeItem(key); location.reload() }}>Reset prototype drafts & preferences</button></> : <><div className="finder-input"><Search size={20} /><input ref={search} aria-label="Find a conversation" placeholder="Where do you want to pick up?" value={query} onChange={e => { setQuery(e.target.value); setIndex(0) }} onKeyDown={e => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setIndex(i => Math.max(0, Math.min(hits.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))) } if (e.key === 'Enter' && hits[index]) { e.preventDefault(); switchSession(hits[index].id) } }} /></div><div className="finder-caption">{query ? 'MATCHING CONVERSATIONS' : 'RECENT CONVERSATIONS'}<span>{hits.length}</span></div><div className="finder-results">{hits.map((s, i) => <button key={s.id} className={index === i ? 'active' : ''} onMouseMove={() => setIndex(i)} onClick={() => switchSession(s.id)}><i className={`dot ${s.status}`} /><span><strong>{s.title}</strong><small>{s.project}</small></span><time>{s.age}</time>{index === i && <ArrowRight size={15} />}</button>)}{!hits.length && <p>No matching fixture sessions.</p>}</div><footer><span>↑ ↓ select</span><span>Enter open</span><span>Esc return</span></footer></>}
    </dialog>}
    {import.meta.env.MODE === 'prototype' && <div className="prototype-switcher"><button aria-label="Previous design variant" onClick={() => changeVariant(variants[(variants.indexOf(variant) + 2) % 3])}><ArrowLeft size={15} /></button><span><b>{variant}</b> {names[variant]}<small>{expanded ? 'expanded' : preview ? 'html preview' : 'chat'} · {managerOnly ? 'manager' : narrow ? 'drawer' : sidebar ? 'sidebar' : 'focused'} · {session.id}</small></span><button aria-label="Next design variant" onClick={() => changeVariant(variants[(variants.indexOf(variant) + 1) % 3])}><ArrowRight size={15} /></button></div>}
  </div>
}

createRoot(document.getElementById('root')!).render(<Workspace />)
