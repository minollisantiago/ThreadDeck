import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { ArrowDown, ArrowLeft, Menu } from 'lucide-react'
import { discordLinks, type Project, type Session } from '../../shared/model'
import { catalogSchema, chatInfoSchema, receiptSchema, type ChatCatalog, type ChatInfo, type OperationReceipt } from '../../shared/chat'
import { ChatRequestError, chatRequest, jsonRequest } from './api'
import { useDraft } from './drafts'
import { PromptComposer } from './composer'
import { PublishedMessages } from './messages'
import { HtmlPreview } from './html-preview'
import { useConversation } from './use-conversation'
import { ChatState } from './chat-state'

export type ChatTarget = { session: Session; project: Project } | { session?: undefined; project: Project }
type Pending = { id: string; text: string; files: string[] }
const scrolls = new Map<string, number>()
export function ConversationPane({ target, sidebar, close, created, markRead }: { target: ChatTarget; sidebar: () => void; close: () => void; created: (session: Session, project: Project) => void; markRead: (session: Session) => void }) {
  const { session, project } = target, key = session?.id || `new:${project.id}`, pendingKey = `threaddeck:chat-operation:${key}`
  const [retry, setRetry] = useState(0)
  const draft = useDraft(key), conversation = useConversation(session?.threadId, retry)
  const [expanded, setExpanded] = useState(false), [info, setInfo] = useState<ChatInfo | null>(null), [bridgeError, setBridgeError] = useState('')
  const [catalog, setCatalog] = useState<ChatCatalog>({ entries: [] }), [preview, setPreview] = useState<{ name: string; url: string } | null>(null)
  const [pending, setPending] = useState<Pending | null>(() => { try { return z.object({ id: z.uuid(), text: z.string(), files: z.array(z.string()) }).parse(JSON.parse(localStorage.getItem(pendingKey) || 'null')) } catch { return null } })
  const [receipt, setReceipt] = useState<OperationReceipt | null>(null), [operationError, setOperationError] = useState(''), [newMessages, setNewMessages] = useState(false)
  const transcript = useRef<HTMLDivElement>(null), following = useRef(true), initialized = useRef(false), count = useRef(0), savingPage = useRef(false)
  const latest = useRef({ draft, pending, created, target }); latest.current = { draft, pending, created, target }
  const links = session ? discordLinks(session) : null
  const busy = session?.status === 'working' || Boolean(session?.agentCount)
  const deliveredReply = Boolean(session?.responseAt != null && conversation.messages.some(message => message.author.bot && Date.parse(message.edited_timestamp || message.timestamp) >= session.responseAt!))
  useEffect(() => {
    const request = (event: Event) => {
      if (transcript.current) scrolls.set(key, transcript.current.scrollTop)
      setPreview(null)
      if ((event as CustomEvent).detail === 'toggle') setExpanded(value => !value)
      requestAnimationFrame(() => window.dispatchEvent(new Event('threaddeck:composer-focus')))
    }
    window.addEventListener('threaddeck:composer-request', request)
    window.dispatchEvent(new Event('threaddeck:pane-ready'))
    return () => window.removeEventListener('threaddeck:composer-request', request)
  }, [])
  useEffect(() => {
    const abort = new AbortController()
    setBridgeError(''); setInfo(null)
    void chatRequest('info', chatInfoSchema, { signal: abort.signal }).then(value => { setInfo(value); setBridgeError('') }).catch(error => { if (!abort.signal.aborted) setBridgeError(error.message) })
    if (session) void chatRequest(`threads/${session.threadId}/catalog`, catalogSchema, { signal: abort.signal }).then(setCatalog).catch(() => {})
    return () => abort.abort()
  }, [session?.threadId, retry])
  useEffect(() => {
    if (!pending) return
    const abort = new AbortController(); let timer: ReturnType<typeof setTimeout>
    const inspect = async () => {
      try {
        const result = await chatRequest(`operations/${pending.id}`, receiptSchema, { signal: abort.signal })
        if (abort.signal.aborted) return
        setReceipt(result); setOperationError('')
        if (result.state === 'submitted') {
          const current = latest.current.draft.current.current
          if (current.text === pending.text && current.files.map(file => file.id).join() === pending.files.join()) latest.current.draft.save({ text: '', head: 0, anchor: 0, files: [] })
          localStorage.removeItem(pendingKey); setPending(null)
          if (!session && result.threadId && result.sessionId) created({ id: result.sessionId, threadId: result.threadId, projectId: project.id, title: pending.text.replace(/\s+/g, ' ').slice(0, 80) || 'New conversation', guildId: project.sessions[0]?.guildId || null, status: 'working', updatedAt: Date.now(), agentCount: 1 }, project)
          return
        }
        if (result.state === 'unknown' || result.state === 'failed') return
      } catch (error) { if (!abort.signal.aborted) setOperationError(error instanceof Error ? error.message : 'Cannot reconcile this submission') }
      if (!abort.signal.aborted) timer = setTimeout(inspect, 2000)
    }
    timer = setTimeout(inspect, 1200)
    return () => { abort.abort(); clearTimeout(timer) }
  }, [pending?.id])
  async function submit(delivery: 'send' | 'queue') {
    if (!info || bridgeError || conversation.error || conversation.loading || pending || preview || draft.conflict || conversation.stale || draft.current.current.files.some(file => file.available === false) || !draft.current.current.text.trim() && !draft.current.current.files.length) return
    const current = draft.current.current, id = crypto.randomUUID(), operation = { id, text: current.text, files: current.files.map(file => file.id) }
    try { localStorage.setItem(pendingKey, JSON.stringify(operation)) } catch { setOperationError('Cannot durably record delivery status. Enable local storage before sending.'); return }
    setPending(operation); setReceipt(null); setOperationError('')
    try {
      const invocation = catalog.entries.map(entry => ({ ...entry, prefix: `/${entry.name}${entry.kind === 'skill' ? '-skill' : ''}` })).sort((a, b) => b.prefix.length - a.prefix.length).find(entry => current.text === entry.prefix || current.text.startsWith(`${entry.prefix} `) || current.text.startsWith(`${entry.prefix}\n`))
      const response = await chatRequest('submit', receiptSchema, jsonRequest({ requestId: id, ...(session ? { threadId: session.threadId } : { projectId: project.id }),
        ...(invocation ? { kind: invocation.kind, name: invocation.name, text: current.text.slice(invocation.prefix.length).trimStart() } : { text: current.text }),
        files: current.files.map(({ id, name }) => ({ id, name })), delivery }))
      setReceipt(response)
    } catch (error) {
      if (error instanceof ChatRequestError && ['invalid', 'unlinked', 'unsupported'].includes(error.code)) { localStorage.removeItem(pendingKey); setPending(null); setOperationError(error.message) }
      else setOperationError(`${error instanceof Error ? error.message : 'Submission interrupted'} Reconcile this operation; do not automatically resend.`)
    }
  }
  useEffect(() => {
    const handler = (event: Event) => { void submit((event as CustomEvent<'send' | 'queue'>).detail) }
    window.addEventListener('threaddeck:composer-submit', handler)
    return () => window.removeEventListener('threaddeck:composer-submit', handler)
  }, [info, bridgeError, pending, draft.conflict, conversation.stale, conversation.error, conversation.loading, preview, catalog])
  useLayoutEffect(() => {
    const node = transcript.current
    if (node && !expanded && !preview && scrolls.has(key)) { node.scrollTop = scrolls.get(key)!; following.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80 }
  }, [expanded, preview])
  useLayoutEffect(() => {
    const node = transcript.current
    if (!node || !info || bridgeError || conversation.loading || conversation.error) return
    if (!initialized.current && conversation.messages.length) { node.scrollTop = scrolls.get(key) ?? node.scrollHeight; following.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80; initialized.current = true }
    else if (!savingPage.current && following.current) node.scrollTop = node.scrollHeight
    else if (conversation.messages.length > count.current && !following.current) setNewMessages(true)
    count.current = conversation.messages.length
    if (following.current && !preview && session && deliveredReply) markRead(session)
  }, [conversation.messages, expanded, preview, session?.responseAt, info, bridgeError, conversation.loading, conversation.error])
  function remember() {
    const node = transcript.current
    if (!node) return
    scrolls.set(key, node.scrollTop); following.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80
    if (following.current) { setNewMessages(false); if (session && deliveredReply && info && !bridgeError && !conversation.loading && !conversation.error) markRead(session) }
  }
  const block = bridgeError || conversation.error
  const loading = !block && (!info || conversation.loading)
  return <main className="chat-pane" data-chat-ready>
    <header className="chat-pane-header"><button aria-label="Toggle session sidebar" onClick={sidebar}><Menu size={18} /></button><div><span className="chat-channel-name" title={`# ${project.name}`}># {project.name}</span><strong>{session?.title || 'New conversation'}</strong></div>{links && <a href={links.app}>Discord ↗</a>}<button aria-label="Close conversation" onClick={close}><ArrowLeft size={16} /></button></header>
    {preview ? <HtmlPreview name={preview.name} url={preview.url} close={() => setPreview(null)} /> : <>
      {(!expanded || block || loading) && <div ref={transcript} className={`chat-transcript ${block || loading ? 'chat-transcript-state' : ''}`} tabIndex={0} aria-label="Conversation messages" aria-busy={loading} onScroll={remember}>
        {block ? <ChatState title="Can’t connect to this conversation" detail={block}><button onClick={() => setRetry(value => value + 1)}>Reconnect</button>{links && <a href={links.app}>Continue in Discord ↗</a>}</ChatState> : loading ? <ChatState loading title={session ? 'Opening your conversation' : 'Preparing your workspace'} detail={session ? 'Retrieving the published messages from Kimaki…' : 'Connecting to Kimaki before your next thread.'} /> : <>
        {conversation.before && <button className="chat-load-earlier" onClick={async () => { const el = transcript.current; if (!el) return; const height = el.scrollHeight; savingPage.current = true; try { await conversation.earlier(); requestAnimationFrame(() => { el.scrollTop += el.scrollHeight - height; savingPage.current = false }) } catch { savingPage.current = false; setOperationError('Could not load earlier messages') } }}>Load earlier messages</button>}
        {!session && <div className="chat-welcome"><h2>Start a conversation</h2><p>Your first prompt creates a linked Kimaki session and Discord thread in {project.name}.</p></div>}
        {session && <PublishedMessages messages={conversation.messages} threadId={session.threadId} discordUrl={links?.browser} preview={(name, url) => { remember(); setPreview({ name, url }) }} />}
        {newMessages && <button className="chat-new-messages" onClick={() => { if (transcript.current) transcript.current.scrollTop = transcript.current.scrollHeight; setNewMessages(false) }}>New messages <ArrowDown size={13} /></button>}
      </> }</div>}
      {!block && conversation.stale && <p className="chat-error">Discord connection is stale. The transcript may be incomplete.</p>}
      {draft.conflict && <div className="chat-error" role="alert">This draft changed in another window. <button onClick={draft.keep}>Keep my draft</button><button onClick={draft.reload}>Load saved draft</button></div>}
      {draft.storageError && <p className="chat-error">Draft is in memory only: browser storage is unavailable.</p>}
      <PromptComposer draft={draft.draft} change={draft.save} expanded={expanded && !block && !loading} toggle={() => { remember(); setExpanded(value => !value) }} enabled={!loading && !block && !conversation.stale && !draft.conflict} busy={busy && !loading && !block && !conversation.stale} pending={Boolean(pending)} catalog={catalog} submit={submit} stop={() => { if (session && confirm('Stop the current turn and clear its queued prompts?')) void chatRequest(`threads/${session.threadId}/abort`, z.object({ stopped: z.boolean() }), jsonRequest({})).catch(error => setOperationError(error.message)) }} />
      {(operationError || pending && ['unknown', 'failed'].includes(receipt?.state || '')) && <div className="chat-operation" role="status"><strong>{receipt?.state || 'Submission needs attention'}</strong>{receipt?.state === 'unknown' && <span>Delivery uncertain. Your draft was kept. Inspect Discord before deciding to send again.</span>}{operationError && <span>{operationError}</span>}{pending && <small>Operation {pending.id}</small>}{pending && <button onClick={() => { if (confirm('This does not undo the submission. Only clear the delivery guard after checking Discord and confirming it is safe to submit again.')) { localStorage.removeItem(pendingKey); setPending(null); setReceipt(null) } }}>Resolve delivery guard…</button>}</div>}
    </>}
  </main>
}
