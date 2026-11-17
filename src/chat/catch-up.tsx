import { useEffect, useRef, useState } from 'react'
import { ArrowRight, RefreshCw } from 'lucide-react'
import { isAttention, type Session } from '../../shared/model'
import type { CatchUpEntry } from './use-catch-up'
import { ReviewSummaryCache, type ReviewPreview } from './review-summary'
export { exchangePreview } from './review-summary'
import './catch-up.css'

function SessionBrief({ session, open, cache }: { session: Session; open: (session: Session) => void; cache: ReviewSummaryCache }) {
  const element = useRef<HTMLElement>(null)
  const [nearby, setNearby] = useState(typeof IntersectionObserver === 'undefined')
  const [result, setResult] = useState<ReviewPreview | null>(null)
  const [loading, setLoading] = useState(true), [retry, setRetry] = useState(0)
  const lastRetry = useRef(0)
  const version = session.responseAt ?? session.updatedAt
  const { exchange, error, stale } = result ?? { exchange: null, error: '', stale: false }
  useEffect(() => {
    if (nearby || !element.current) return
    // Startup entries are cached; new, on-demand entries load only near the viewport.
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { setNearby(true); observer.disconnect() } }, { rootMargin: '200px' })
    observer.observe(element.current)
    return () => observer.disconnect()
  }, [nearby])
  useEffect(() => {
    if (!nearby) return
    let active = true
    setLoading(true)
    const refresh = retry !== lastRetry.current; lastRetry.current = retry
    void cache.get(session, refresh).then(result => { if (active) { setResult(result); setLoading(false) } })
    return () => { active = false }
  }, [session.threadId, version, retry, nearby, cache])
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
export function CatchUpPane({ entries, open, connected, cache: sharedCache }: { entries: CatchUpEntry[]; open: (session: Session) => void; connected: boolean; cache?: ReviewSummaryCache }) {
  const [localCache] = useState(() => new ReviewSummaryCache())
  const cache = sharedCache ?? localCache
  const projects = [...new Map(entries.map(entry => [entry.project.id, entry.project])).values()]
  return <main className="chat-pane catch-up-pane" aria-label="Review summary">
    <div className="catch-up-scroll"><div className="catch-up-content">
      <h1 className="catch-up-heading">Pending review</h1>
      {!connected && <p className="catch-up-connection" role="status">Connection unavailable or stale. This overview may not include the latest activity.</p>}
      {entries.length > 0 ? <>
        {projects.map(project => {
          const threads = entries.filter(entry => entry.project.id === project.id)
          return <section key={project.id} className="catch-up-project" aria-labelledby={`catch-up-${project.id}`}><h2 id={`catch-up-${project.id}`}><span>#</span> {project.name} <small>{threads.length} {threads.length === 1 ? 'thread' : 'threads'}</small></h2>{threads.sort((a, b) => Number(isAttention(b.session.status)) - Number(isAttention(a.session.status)) || b.session.updatedAt - a.session.updatedAt).map(({ session }) => <SessionBrief key={session.id} session={session} open={open} cache={cache} />)}</section>
        })}
      </> : <p className="catch-up-muted">No unread threads to review.</p>}
    </div></div>
  </main>
}
