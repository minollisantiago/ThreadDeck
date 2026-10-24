import { useEffect, useState } from 'react'
import { catalogSchema, type ChatCatalog } from '../../shared/chat'
import { chatRequest } from '../chat/api'

export function CommandReference({ threadId }: { threadId?: string }) {
  const [catalog, setCatalog] = useState<ChatCatalog | null>(null), [error, setError] = useState(''), [query, setQuery] = useState(''), [retry, setRetry] = useState(0)
  useEffect(() => {
    if (!threadId) return
    const controller = new AbortController()
    setCatalog(null); setError('')
    void chatRequest(`threads/${threadId}/catalog`, catalogSchema, { signal: controller.signal }).then(value => {
      if (!controller.signal.aborted) setCatalog(value)
    }).catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Command catalog unavailable') })
    return () => controller.abort()
  }, [threadId, retry])
  const invocation = (entry: ChatCatalog['entries'][number]) => `/${entry.name}${entry.kind === 'skill' ? '-skill' : ''}`
  const entries = catalog?.entries.filter(entry => `${invocation(entry)} ${entry.description || ''}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())).sort((a, b) => invocation(a).localeCompare(invocation(b))) || []
  return <div className="keyboard-shortcuts-body command-reference">
    <p>Available through Kimaki for the selected conversation’s project. Type a listed slash command in the composer, followed by any arguments, then send it.</p>
    {!threadId ? <p role="status">Open an existing conversation to see its commands and skills. For a new conversation, send the first prompt before invoking commands.</p> : <>
      <input aria-label="Filter commands and skills" type="search" placeholder="Filter commands and skills…" value={query} onChange={event => setQuery(event.target.value)} />
      {error ? <p role="alert">{error} <button onClick={() => setRetry(value => value + 1)}>Retry</button></p> : !catalog ? <p role="status">Loading project commands and skills…</p> : <>
        {(['command', 'skill'] as const).map(kind => { const matches = entries.filter(entry => entry.kind === kind); return matches.length > 0 && <section key={kind}><h3>{kind === 'command' ? 'Project slash commands' : 'Skills'} · {matches.length}</h3><dl>{matches.map(entry => <div key={`${kind}:${entry.name}`}><dt><code>{invocation(entry)}</code></dt><dd>{entry.description || 'No description provided.'}</dd></div>)}</dl></section> })}
        {!entries.length && <p role="status">{query ? 'No matching commands or skills.' : 'No commands or skills are available for this project.'}</p>}
      </>}
    </>}
    <section><h3>Kimaki app actions</h3><dl><div><dt>Send / Queue</dt><dd>Send a prompt or queue it while a turn is working.</dd></div><div><dt>Send now / interrupt</dt><dd>Interrupt the working turn with your next prompt.</dd></div><div><dt>Stop</dt><dd>Stop the turn and clear queued prompts, after confirmation.</dd></div></dl></section>
    <p className="command-reference-note">Skills currently require Send now and cannot be queued. Bot-management slash commands and Discord interaction answers are not supported in this app yet; use Discord for those. This catalog lists only commands and skills the app can invoke.</p>
  </div>
}
