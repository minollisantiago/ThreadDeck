import { useEffect, useRef, useState } from 'react'
import { ArrowRight, RefreshCw } from 'lucide-react'
import { historySchema, type PublishedMessage } from '../../shared/chat'
import { isAttention, type Session } from '../../shared/model'
import { chatRequest } from './api'
import type { CatchUpEntry } from './use-catch-up'
import { displayPublishedMessage, groupPublishedMessages } from './message-groups'
import { publishedMarkdown } from './published-markdown'
import './catch-up.css'

// Extract, rather than invent, the last exchange. No model calls or automatic replies.
export function exchangePreview(messages: PublishedMessage[]) {
  const meaningful = groupPublishedMessages(messages).map(group => ({ role: group.role, text: publishedMarkdown(group.messages.map(displayPublishedMessage)).replace(/^-# .*$/gm, '').trim() })).filter(group => group.text)
  const agent = meaningful.findLast(group => group.role === 'assistant')
  const user = meaningful.findLast(group => group.role !== 'assistant')
  const excerpt = (content?: string) => {
    if (!content) return null
    const text = content.replace(/```[\s\S]*?```/g, ' [code] ').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/https?:\/\/\S+/g, '[link]').replace(/[#*_`~]/g, '').replace(/\s+/g, ' ').trim()
    return text.length > 440 ? `${text.slice(0, 439)}…` : text
  }
  return { user: excerpt(user?.text), agent: excerpt(agent?.text) }
}
function SessionBrief({ session, open }: { session: Session; open: (session: Session) => void }) {
  const element = useRef<HTMLElement>(null)
  const [nearby, setNearby] = useState(typeof IntersectionObserver === 'undefined')
  const [exchange, setExchange] = useState<ReturnType<typeof exchangePreview> | null>(null)
  const [error, setError] = useState(''), [loading, setLoading] = useState(true), [retry, setRetry] = useState(0), [stale, setStale] = useState(false)
  useEffect(() => {
    if (nearby || !element.current) return
    // Large catch-ups should not fetch hundreds of full thread histories at startup.
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { setNearby(true); observer.disconnect() } }, { rootMargin: '200px' })
    observer.observe(element.current)
    return () => observer.disconnect()
  }, [nearby])
  useEffect(() => {
    if (!nearby) return
    const controller = new AbortController()
    setLoading(true); setError(''); setExchange(null)
    void chatRequest(`threads/${session.threadId}/messages`, historySchema, { signal: controller.signal }).then(page => {
      if (controller.signal.aborted) return
      setExchange(exchangePreview(page.messages)); setStale(page.stale); setLoading(false)
    }).catch(() => {
      if (controller.signal.aborted) return
      setLoading(false); setError('The latest exchange could not be loaded.')
    })
    return () => controller.abort()
  }, [session.threadId, session.responseAt, session.updatedAt, retry, nearby])
  const status = session.status === 'working' || session.agentCount > 0 ? 'Still working' : session.status === 'input' ? 'Needs your input' : session.status === 'permission' ? 'Permission needed' : session.status === 'error' ? 'Needs attention' : 'New response'
  return <article className="catch-up-session" ref={element}>
    <div className="catch-up-session-heading"><h3><a href={`#session/${session.id}`} onClick={event => { event.preventDefault(); open(session) }}>{session.title}</a></h3><span className="catch-up-status" data-attention={isAttention(session.status)}>{status}</span></div>
    {loading ? <p className="catch-up-muted" role="status">Loading the latest exchange…</p> : error ? <div className="catch-up-load-error"><p>{error}</p><button onClick={() => setRetry(value => value + 1)}><RefreshCw size={12} />Retry</button></div> : <>
      {exchange?.user && <p className="catch-up-excerpt"><span>You</span>{exchange.user}</p>}
      {exchange?.agent && <p className="catch-up-excerpt"><span>Agent</span>{exchange.agent}</p>}
      {!exchange?.user && !exchange?.agent && <p className="catch-up-muted">No text preview available. Open the thread to view its activity.</p>}
      {stale && <p className="catch-up-muted">Cached exchange · latest activity may be unavailable.</p>}
    </>}
    <a className="catch-up-thread-link" href={`#session/${session.id}`} onClick={event => { event.preventDefault(); open(session) }}>Open thread <ArrowRight size={13} /></a>
  </article>
}
export function CatchUpPane({ entries, open, connected }: { entries: CatchUpEntry[]; open: (session: Session) => void; connected: boolean }) {
  const projects = [...new Map(entries.map(entry => [entry.project.id, entry.project])).values()]
  return <main className="chat-pane catch-up-pane" aria-label="Review summary">
    <div className="catch-up-scroll"><div className="catch-up-content">
      <h1 className="catch-up-heading">Pending review</h1>
      {!connected && <p className="catch-up-connection" role="status">Connection unavailable or stale. This overview may not include the latest activity.</p>}
      {entries.length > 0 ? <>
        {projects.map(project => {
          const threads = entries.filter(entry => entry.project.id === project.id)
          return <section key={project.id} className="catch-up-project" aria-labelledby={`catch-up-${project.id}`}><h2 id={`catch-up-${project.id}`}><span>#</span> {project.name} <small>{threads.length} {threads.length === 1 ? 'thread' : 'threads'}</small></h2>{threads.sort((a, b) => Number(isAttention(b.session.status)) - Number(isAttention(a.session.status)) || b.session.updatedAt - a.session.updatedAt).map(({ session }) => <SessionBrief key={session.id} session={session} open={open} />)}</section>
        })}
      </> : <p className="catch-up-muted">No unread threads to review.</p>}
    </div></div>
  </main>
}
