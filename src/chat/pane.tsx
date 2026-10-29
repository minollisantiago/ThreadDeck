import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { ArrowDown } from 'lucide-react'
import { discordLinks, type Project, type Session } from '../../shared/model'
import { catalogSchema, chatFileSchema, chatInfoSchema, receiptSchema, type ChatCatalog, type ChatInfo, type OperationReceipt } from '../../shared/chat'
import { ChatRequestError, chatRequest, jsonRequest } from './api'
import { useDraft } from './drafts'
import { PromptComposer } from './composer'
import { PublishedMessages } from './messages'
import { HtmlPreview } from './html-preview'
import { useConversation } from './use-conversation'
import { ChatState } from './chat-state'
import { OutgoingMessage } from './outgoing-message'
import { ConversationSkeleton } from './conversation-skeleton'
import { SidebarToggle } from './sidebar-toggle'
import { localOperatorPrompt } from './message-groups'
import { TooltipHint } from '../components/ui/tooltip'
import { isPublished, publicationNonce } from './publication'

export type ChatTarget = { session: Session; project: Project } | { session?: undefined; project: Project }
const pendingSchema = z.object({ id: z.uuid(), nonce: z.string().optional(), text: z.string(), files: z.array(z.string()), attachments: z.array(chatFileSchema.extend({ available: z.boolean().optional() })).optional(), optimistic: z.boolean().optional(), delivery: z.enum(['send', 'queue']).optional() })
type Pending = z.infer<typeof pendingSchema>
type Outgoing = Pending & { state: OperationReceipt['state']; messageIds: string[] }
const scrolls = new Map<string, number>()
export function ConversationPane({ target, focusRequest, mobileSidebar, sidebarOpen, sidebar, created, markRead }: { target: ChatTarget; focusRequest: number; mobileSidebar: boolean; sidebarOpen: boolean; sidebar: () => void; created: (session: Session, project: Project) => void; markRead: (session: Session) => void }) {
  const { session, project } = target, key = session?.id || `new:${project.id}`, pendingKey = `threaddeck:chat-operation:${key}`
  const [retry, setRetry] = useState(0)
  const draft = useDraft(key), conversation = useConversation(session?.threadId, retry)
  const [expanded, setExpanded] = useState(false), [info, setInfo] = useState<ChatInfo | null>(null), [bridgeError, setBridgeError] = useState('')
  const [catalog, setCatalog] = useState<ChatCatalog>({ entries: [] }), [preview, setPreview] = useState<{ name: string; url: string } | null>(null)
  const [pending, setPending] = useState<Pending | null>(() => { try { const saved = pendingSchema.parse(JSON.parse(localStorage.getItem(pendingKey) || 'null')); return { ...saved, attachments: saved.attachments?.map(file => ({ ...file, available: false })) } } catch { return null } })
  const [outgoing, setOutgoing] = useState<Outgoing[]>(() => pending?.optimistic ? [{ ...pending, state: 'accepted', messageIds: [] }] : [])
  const submissionLock = useRef(Boolean(pending))
  useEffect(() => {
    if (!pending || pending.nonce) return
    let cancelled = false
    void publicationNonce(pending.id).then(nonce => {
      if (!cancelled) setOutgoing(previous => previous.map(item => item.id === pending.id ? { ...item, nonce } : item))
    }).catch(() => {}) // Older/unsupported clients can still reconcile by receipt IDs.
    return () => { cancelled = true }
  }, [pending?.id])
  const inputBusy = useRef(false)
  const [forwarding, setForwarding] = useState(false)
  const [receipt, setReceipt] = useState<OperationReceipt | null>(null), [operationError, setOperationError] = useState('')
  const [aboveLatest, setAboveLatest] = useState(false)
  const transcript = useRef<HTMLDivElement>(null), following = useRef(true), initialized = useRef(false), savingPage = useRef(false)
  const latest = useRef({ draft, pending, created, target }); latest.current = { draft, pending, created, target }
  const links = session ? discordLinks(session) : null
  const busy = session?.status === 'working' || Boolean(session?.agentCount)
  const publishedReply = conversation.messages.some(message => message.author.bot && !localOperatorPrompt(message))
  function markVisibleRead() {
    // Harness response timestamps and Discord publication timestamps are not a
    // shared clock. A loaded, visible transcript is the evidence of reading.
    if (!session || !publishedReply || !following.current) return
    if (!info || bridgeError || conversation.loading || conversation.error || conversation.stale) return
    if (preview || expanded || mobileSidebar && sidebarOpen || document.querySelector('dialog[open]')) return
    if (document.visibilityState !== 'visible' || !document.hasFocus()) return
    markRead(session)
  }
  useEffect(() => {
    let frame = 0
    const inspect = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(markVisibleRead) }
    window.addEventListener('focus', inspect); document.addEventListener('visibilitychange', inspect); document.addEventListener('focusin', inspect)
    inspect()
    return () => { cancelAnimationFrame(frame); window.removeEventListener('focus', inspect); document.removeEventListener('visibilitychange', inspect); document.removeEventListener('focusin', inspect) }
  }, [session, publishedReply, info, bridgeError, conversation.loading, conversation.error, conversation.stale, preview, expanded, mobileSidebar, sidebarOpen])
  useEffect(() => {
    const request = (event: Event) => {
      if (transcript.current && initialized.current) scrolls.set(key, transcript.current.scrollTop)
      setPreview(null)
      if ((event as CustomEvent).detail === 'toggle') setExpanded(value => !value)
      requestAnimationFrame(() => window.dispatchEvent(new Event('threaddeck:composer-focus')))
    }
    window.addEventListener('threaddeck:composer-request', request)
    window.dispatchEvent(new Event('threaddeck:pane-ready'))
    return () => window.removeEventListener('threaddeck:composer-request', request)
  }, [])
  useEffect(() => {
    // Run after the finder/drawer has closed and its focus-restoration cleanup
    // has finished. A request counter also handles reselecting the same thread.
    const frame = requestAnimationFrame(() => {
      if (!document.querySelector('dialog[open]')) window.dispatchEvent(new CustomEvent('threaddeck:composer-request', { detail: 'focus' }))
    })
    return () => cancelAnimationFrame(frame)
  }, [focusRequest])
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
          setOutgoing(previous => previous.map(item => item.id === result.id ? { ...item, state: result.state, messageIds: result.messageIds } : item))
        if (result.state === 'submitted') {
          const current = latest.current.draft.current.current
          if (!pending.optimistic && current.text === pending.text && current.files.map(file => file.id).join() === pending.files.join()) latest.current.draft.save({ text: '', head: 0, anchor: 0, files: [] })
          localStorage.removeItem(pendingKey); setPending(null); submissionLock.current = false
          if (!session && result.threadId && result.sessionId) created({ id: result.sessionId, threadId: result.threadId, projectId: project.id, title: pending.text.replace(/\s+/g, ' ').slice(0, 80) || 'New conversation', guildId: project.sessions[0]?.guildId || null, status: 'working', updatedAt: Date.now(), agentCount: 1 }, project)
          return
        }
        if (result.state === 'unknown' || result.state === 'failed') return
      } catch (error) { if (!abort.signal.aborted) { setOperationError(error instanceof Error ? error.message : 'Cannot reconcile this submission'); setOutgoing(previous => previous.map(item => item.id === pending.id ? { ...item, state: 'unknown' } : item)) } }
      if (!abort.signal.aborted) timer = setTimeout(inspect, 2000)
    }
    timer = setTimeout(inspect, 1200)
    return () => { abort.abort(); clearTimeout(timer) }
  }, [pending?.id])
  async function submit(delivery: 'send' | 'queue') {
    if (inputBusy.current || forwarding || draft.current.current.files.some(file => file.audioPrompt) && !info?.capabilities.includes('audio-prompt')) return
    if (!info || bridgeError || conversation.error || conversation.loading || submissionLock.current || pending || preview || draft.conflict || conversation.stale || draft.current.current.files.some(file => file.available === false) || !draft.current.current.text.trim() && !draft.current.current.files.length) return
    const current = draft.current.current, id = crypto.randomUUID(), operation: Pending = { id, text: current.text, files: current.files.map(file => file.id), attachments: current.files, optimistic: true, delivery }
    try { localStorage.setItem(pendingKey, JSON.stringify(operation)) } catch { setOperationError('Cannot durably record delivery status. Enable local storage before sending.'); return }
    submissionLock.current = true; setPending(operation); setReceipt(null); setOperationError('')
    setOutgoing(previous => [...previous, { ...operation, state: 'accepted', messageIds: [] }])
    draft.save({ text: '', head: 0, anchor: 0, files: [] }); setExpanded(false)
    try {
      const nonce = await publicationNonce(id).catch(() => undefined)
      const correlated = { ...operation, nonce }
      localStorage.setItem(pendingKey, JSON.stringify(correlated))
      setPending(correlated)
      setOutgoing(previous => previous.map(item => item.id === id ? { ...item, nonce } : item))
      const invocation = catalog.entries.map(entry => ({ ...entry, prefix: `/${entry.name}${entry.kind === 'skill' ? '-skill' : ''}` })).sort((a, b) => b.prefix.length - a.prefix.length).find(entry => current.text === entry.prefix || current.text.startsWith(`${entry.prefix} `) || current.text.startsWith(`${entry.prefix}\n`))
      const response = await chatRequest('submit', receiptSchema, jsonRequest({ requestId: id, ...(session ? { threadId: session.threadId } : { projectId: project.id }),
        ...(invocation ? { kind: invocation.kind, name: invocation.name, text: current.text.slice(invocation.prefix.length).trimStart() } : { text: current.text }),
        files: current.files.map(({ id, name, audioPrompt }) => ({ id, name, ...(audioPrompt && { audioPrompt }) })), delivery }))
      setReceipt(previous => previous?.id === response.id && previous.state === 'submitted' ? previous : response)
      setOutgoing(previous => previous.map(item => item.id === response.id && item.state !== 'submitted' ? { ...item, state: response.state, messageIds: response.messageIds } : item))
    } catch (error) {
      const rejected = error instanceof ChatRequestError && ['invalid', 'unlinked', 'unsupported'].includes(error.code)
      setOutgoing(previous => previous.map(item => item.id === id ? { ...item, state: rejected ? 'failed' : 'unknown' } : item))
      setOperationError(`${error instanceof Error ? error.message : 'Submission interrupted'} ${rejected ? 'Your prompt is saved below. Restore it before resolving the delivery guard.' : 'Reconcile this operation; do not automatically resend.'}`)
    }
  }
  useEffect(() => {
    const handler = (event: Event) => { void submit((event as CustomEvent<'send' | 'queue'>).detail) }
    window.addEventListener('threaddeck:composer-submit', handler)
    return () => window.removeEventListener('threaddeck:composer-submit', handler)
  }, [info, bridgeError, pending, draft.conflict, conversation.stale, conversation.error, conversation.loading, preview, catalog, forwarding])
  useEffect(() => {
    setOutgoing(previous => previous.filter(item => !isPublished(item, conversation.messages)))
  }, [conversation.messages, receipt])
  useLayoutEffect(() => {
    const node = transcript.current
    if (node && !expanded && !preview && scrolls.has(key)) { node.scrollTop = scrolls.get(key)!; following.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80; setAboveLatest(!following.current) }
  }, [expanded, preview])
  useLayoutEffect(() => {
    const node = transcript.current
    if (!node || !info || bridgeError || conversation.loading || conversation.error) return
    if (!initialized.current && conversation.messages.length) { node.scrollTop = scrolls.get(key) ?? node.scrollHeight; following.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80; initialized.current = true }
    else if (!savingPage.current && following.current) node.scrollTop = node.scrollHeight
    setAboveLatest(!following.current)
    markVisibleRead()
  }, [conversation.messages, outgoing, expanded, preview, session?.responseAt, info, bridgeError, conversation.loading, conversation.error])
  function remember() {
    const node = transcript.current
    if (!node) return
    scrolls.set(key, node.scrollTop); following.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80
    setAboveLatest(!following.current)
    markVisibleRead()
  }
  const block = bridgeError || conversation.error
  const loading = !block && (!info || conversation.loading)
  return <main className="chat-pane" data-chat-ready>
    <header className="chat-pane-header">{mobileSidebar && <SidebarToggle open={sidebarOpen} toggle={sidebar} />}<div><TooltipHint label={`# ${project.name}`}><span className="chat-channel-name"><span className="channel-hash" aria-hidden="true">#</span> {project.name}</span></TooltipHint><strong>{links && session ? <TooltipHint label="Open this thread in Discord"><a className="chat-thread-title" href={links.app}>{session.title}</a></TooltipHint> : session?.title || 'New conversation'}</strong></div>{links && <a href={links.app}>Discord ↗</a>}</header>
    {preview ? <HtmlPreview name={preview.name} url={preview.url} close={() => setPreview(null)} /> : <>
      {(!expanded || block || loading) && <div ref={transcript} className={`chat-transcript ${block || loading ? 'chat-transcript-state' : ''}`} tabIndex={0} aria-label="Conversation messages" aria-busy={loading} onScroll={remember}>
        {block ? <ChatState title="Can’t connect to this conversation" detail={block}><button onClick={() => setRetry(value => value + 1)}>Reconnect</button>{links && <a href={links.app}>Continue in Discord ↗</a>}</ChatState> : loading ? session ? <ConversationSkeleton /> : <ChatState loading title="Preparing your workspace" detail="Connecting to Kimaki before your next thread." /> : <>
        {conversation.before && <button className="chat-load-earlier" onClick={async () => { const el = transcript.current; if (!el) return; const height = el.scrollHeight; savingPage.current = true; try { await conversation.earlier(); requestAnimationFrame(() => { el.scrollTop += el.scrollHeight - height; savingPage.current = false }) } catch { savingPage.current = false; setOperationError('Could not load earlier messages') } }}>Load earlier messages</button>}
        {!session && <div className="chat-welcome"><h2>Start a conversation</h2><p>Your first prompt creates a linked Kimaki session and Discord thread in {project.name}.</p></div>}
        {session && <PublishedMessages messages={conversation.messages} threadId={session.threadId} busy={busy} stale={conversation.stale} discordUrl={links?.browser} preview={(name, url) => { remember(); setPreview({ name, url }) }} forwardAudio={info?.capabilities.includes('audio-prompt') && !conversation.stale && !pending && !forwarding ? (name, url) => {
          if (inputBusy.current || pending || draft.current.current.files.some(file => file.audioPrompt) || draft.current.current.files.length >= 10) { setOperationError('Wait for uploads and remove the current audio prompt before forwarding audio.'); return }
          setForwarding(true)
          void (async () => {
            const response = await fetch(url)
            if (!response.ok) throw new Error('Could not read this audio attachment')
            const bytes = await response.blob()
            const file = await chatRequest(`files?name=${encodeURIComponent(name)}`, chatFileSchema, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: bytes })
            if (draft.current.current.files.some(file => file.audioPrompt) || draft.current.current.files.length >= 10) throw new Error('Your draft changed while forwarding. Remove an attachment before trying again.')
            draft.save({ files: [...draft.current.current.files, { ...file, audioPrompt: true, available: true }] })
          })().catch(error => setOperationError(error.message)).finally(() => setForwarding(false))
        } : undefined} />}
        {outgoing.filter(item => !isPublished(item, conversation.messages)).map(item => <OutgoingMessage key={item.id} text={item.text} files={item.attachments || item.files.map(id => ({ id, name: 'Attached file' }))} state={item.state} queued={item.delivery === 'queue'} canRestore={!draft.conflict && !draft.draft.text && !draft.draft.files.length} restore={() => { if (!draft.conflict && !draft.current.current.text && !draft.current.current.files.length) draft.save({ text: item.text, files: item.attachments || [], anchor: item.text.length, head: item.text.length }) }} />)}
      </> }</div>}
      {!block && conversation.stale && <p className="chat-error">Discord connection is stale. The transcript may be incomplete.</p>}
      {draft.conflict && <div className="chat-error" role="alert">This draft changed in another window. <button onClick={draft.keep}>Keep my draft</button><button onClick={draft.reload}>Load saved draft</button></div>}
      {draft.storageError && <p className="chat-error">Draft is in memory only: browser storage is unavailable.</p>}
      {aboveLatest && !expanded && !block && !loading && <div className="chat-scroll-anchor"><TooltipHint label="Scroll to latest message"><button className="chat-jump-latest" aria-label="Scroll to latest message" onClick={() => { if (transcript.current) { transcript.current.scrollTop = transcript.current.scrollHeight; remember() } }}><ArrowDown size={16} /></button></TooltipHint></div>}
      <PromptComposer model={session?.model} audioEnabled={Boolean(info?.capabilities.includes('audio-prompt'))} onBusyChange={value => { inputBusy.current = value }} draft={draft.draft} change={draft.save} expanded={expanded && !block && !loading} toggle={() => { remember(); setExpanded(value => !value) }} enabled={!loading && !block && !forwarding && !conversation.stale && !draft.conflict} busy={busy && !loading && !block && !conversation.stale} pending={Boolean(pending)} catalog={catalog} submit={submit} stop={() => { if (session && confirm('Stop the current turn and clear its queued prompts?')) void chatRequest(`threads/${session.threadId}/abort`, z.object({ stopped: z.boolean() }), jsonRequest({})).catch(error => setOperationError(error.message)) }} />
      {(operationError || receipt?.state === 'transcribing' || pending && ['unknown', 'failed'].includes(receipt?.state || '')) && <div className="chat-operation" role="status"><strong>{receipt?.state === 'transcribing' ? 'Kimaki is transcribing your audio…' : receipt?.state || 'Submission needs attention'}</strong>{receipt?.state === 'unknown' && <span>{receipt.error || 'Delivery uncertain. Your prompt was saved. Inspect Discord before deciding to send again.'}</span>}{operationError && <span>{operationError}</span>}{pending && <small>Operation {pending.id}</small>}{pending && receipt?.state !== 'transcribing' && <button onClick={() => { if (confirm('This does not undo the submission. Only clear the delivery guard after checking Discord and confirming it is safe to submit again.')) { localStorage.removeItem(pendingKey); setPending(null); setReceipt(null); submissionLock.current = false } }}>Resolve delivery guard…</button>}</div>}
    </>}
  </main>
}
