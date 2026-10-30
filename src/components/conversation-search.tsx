import { useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { discordLinks } from '../../shared/model'
import { Kbd } from './ui/kbd'
import { searchResponseSchema, type SearchHit, type SearchResponse } from '../../shared/search'

function Highlight({ text, query }: { text: string; query: string }) {
  const tokens = query.match(/[\p{L}\p{N}_]+/gu)
  if (!tokens?.length) return <>{text}</>
  const pattern = new RegExp(`(${tokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
  return <>{text.split(pattern).map((part, i) => i % 2 ? <mark key={i}>{part}</mark> : part)}</>
}

export function ConversationSearch({ close, onSelect }: { close: () => void; onSelect?: (hit: SearchHit) => boolean }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const [data, setData] = useState<SearchResponse | null>(null)
  const [resultQuery, setResultQuery] = useState('')
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(0)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const previous = document.activeElement
    if (dialog.current?.showModal) dialog.current.showModal()
    else dialog.current?.setAttribute('open', '')
    input.current?.focus()
    return () => { if (previous instanceof HTMLElement) previous.focus() }
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setSelected(0); setError(false)
    const timer = setTimeout(() => {
      void fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then(async response => {
          if (!response.ok) throw new Error('Search unavailable')
          const next = searchResponseSchema.parse(await response.json())
          if (!controller.signal.aborted) { setData(next); setResultQuery(query); setLoading(false) }
        }).catch(() => { if (!controller.signal.aborted) { setError(true); setLoading(false) } })
    }, 70)
    return () => { clearTimeout(timer); controller.abort() }
  }, [query, revision])
  useEffect(() => {
    if (!data?.indexing && !data?.error && !error) return
    const timer = setTimeout(() => setRevision(n => n + 1), 3000)
    return () => clearTimeout(timer)
  }, [data, error])
  useEffect(() => { list.current?.querySelector(`[data-index="${selected}"]`)?.scrollIntoView?.({ block: 'nearest' }) }, [selected])
  const hits = error ? [] : data?.hits ?? []
  return <dialog ref={dialog} className="conversation-search" aria-labelledby="conversation-search-title" onCancel={event => { event.preventDefault(); close() }} onClick={event => { if (event.target === dialog.current) close() }} onKeyDown={event => {
    if (event.key === 'Tab') {
      const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button,input,a[href]')]
      const first = controls[0], last = controls.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    if (event.key === 'Escape') { event.preventDefault(); close() }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setSelected(n => Math.max(0, Math.min(hits.length - 1, n + (event.key === 'ArrowDown' ? 1 : -1))))
    }
    if (event.key === 'Enter' && event.target === input.current) {
      event.preventDefault()
      if (!loading) list.current?.querySelector<HTMLAnchorElement>(`[data-index="${selected}"] a`)?.click()
    }
  }}>
    <div className="conversation-search-heading"><h2 id="conversation-search-title">Search conversations</h2><button aria-label="Close conversation search" onClick={close}><X /></button></div>
    <div className="conversation-search-input"><Search aria-hidden="true" /><input ref={input} aria-label="Search conversation history" placeholder="Remember a phrase, topic, or thread title…" value={query} onChange={event => setQuery(event.target.value)} aria-controls="conversation-search-results" /><kbd>Esc</kbd></div>
    <p className="conversation-search-status" role="status">{error ? 'Search unavailable. Retrying…' : loading ? 'Searching…' : `${data?.indexed ?? 0} conversations indexed · ${query.trim() ? `${hits.length} results` : 'Recent conversations'}`}{data?.indexing ? ' · Indexing history…' : ''}</p>
    {data?.error && <p className="conversation-search-status" role="alert">{data.error}</p>}
    <div className="conversation-search-results" id="conversation-search-results" ref={list} aria-busy={loading}>
      {hits.map((hit, index) => {
        const links = discordLinks(hit)
        return <article key={hit.id} data-index={index} data-selected={selected === index} onMouseMove={() => setSelected(index)}>
          <div className="conversation-search-result-title">{links ? <a href={links.app} onClick={event => { if (onSelect && !event.ctrlKey && !event.metaKey && !event.shiftKey && onSelect(hit)) event.preventDefault() }}><Highlight text={hit.title} query={resultQuery} /></a> : <strong><Highlight text={hit.title} query={resultQuery} /></strong>}{links && <a className="conversation-search-browser" href={links.browser} target="_blank" rel="noreferrer" aria-label={`Open ${hit.title} in browser`}>↗</a>}</div>
          <p className="conversation-search-meta">{hit.project} · {new Date(hit.updatedAt).toLocaleDateString()}{hit.matches > 0 ? ` · ${hit.matches} matching messages` : ''}</p>
          {hit.excerpt && <p className="conversation-search-excerpt"><Highlight text={hit.excerpt} query={resultQuery} /></p>}
        </article>
      })}
      {!loading && !error && !hits.length && <p className="conversation-search-status">{data?.indexing ? 'Building your history index. Results appear as conversations are indexed.' : 'No matching conversations. Try different words or a shorter phrase.'}</p>}
    </div>
    <div className="conversation-search-footer chat-finder-keybindings"><span><Kbd>↑ ↓</Kbd> navigate</span><span><Kbd>Enter</Kbd> open{onSelect ? '' : ' Discord'}</span><span><Kbd>Esc</Kbd> exit</span><span className="chat-finder-scope">All history</span></div>
  </dialog>
}
