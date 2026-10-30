import { useEffect, useState } from 'react'
import { ArrowLeft, Folder, GitBranch, RefreshCw, X } from 'lucide-react'
import { projectSchema, type Project } from '../../shared/model'
import { projectBrowseSchema, type ProjectBrowse } from '../../shared/projects'
import './project-browser.css'

async function request(url: string, options?: RequestInit) {
  const response = await fetch(`/api/projects/${url}`, options)
  const value = await response.json()
  if (!response.ok) throw new Error(value.error || 'Projects unavailable')
  return value
}

export function ProjectBrowser({ back, close, create }: { back?: () => void; close: () => void; create: (project: Project) => void }) {
  const [directory, setDirectory] = useState<string>(), [path, setPath] = useState(''), [revision, setRevision] = useState(0)
  const [listing, setListing] = useState<ProjectBrowse | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false)
  const [guild, setGuild] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError('')
    request(`browse${directory ? `?directory=${encodeURIComponent(directory)}` : ''}`, { signal: controller.signal }).then(value => {
      if (controller.signal.aborted) return
      const result = projectBrowseSchema.parse(value)
      setListing(result); setPath(result.directory); setGuild(previous => result.guilds.includes(previous) ? previous : result.guilds.length === 1 ? result.guilds[0] : '')
    }).catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Projects unavailable') }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [directory, revision])
  const navigate = (next: string) => { setDirectory(next); setRevision(value => value + 1) }
  const start = async () => {
    if (!listing || busy || loading) return
    if (listing.registered) { create(listing.registered); return }
    setBusy(true); setError('')
    try {
      const project = projectSchema.parse(await request('register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ directory: listing.directory, ...(guild && { guild }) }) }))
      create(project)
    } catch (error) { setError(error instanceof Error ? error.message : 'Registration failed') }
    finally { setBusy(false) }
  }
  return <section className="chat-project-browser" aria-label="Discover projects" aria-busy={loading || busy}>
    <header>{back && <button aria-label="Back to projects" disabled={busy} onClick={back}><ArrowLeft size={18} /></button>}<strong>Add a project</strong><button aria-label="Close project browser" disabled={busy} onClick={close}><X size={18} /></button></header>
    <p className="chat-muted">Browse folders on the machine running Kimaki. Adding a project creates its Discord channel; your first prompt starts the session.</p>
    <form onSubmit={event => { event.preventDefault(); navigate(path) }}><input autoFocus aria-label="Folder path" placeholder="Absolute folder path…" value={path} disabled={busy} onChange={event => setPath(event.target.value)} /><button disabled={busy || !path.trim()}>Go</button><button type="button" disabled={busy} aria-label="Refresh folders" onClick={() => setRevision(value => value + 1)}><RefreshCw size={15} /></button></form>
    {listing && <><nav aria-label="Project locations">{listing.locations.map(location => <button key={location} disabled={busy} onClick={() => navigate(location)}>{location}</button>)}</nav>
      {listing.guilds.length > 1 && <label>Discord server <select aria-label="Discord server" value={guild} disabled={busy} onChange={event => setGuild(event.target.value)}><option value="">Choose a server…</option>{listing.guilds.map(id => <option key={id} value={id}>{id}</option>)}</select></label>}
    </>}
    {error && <p role="alert">{error}</p>}
    {loading ? <p role="status" className="chat-muted">Loading folders…</p> : !error && listing && <div className="chat-finder-results">
      {listing.parent && <button disabled={busy} onClick={() => navigate(listing.parent!)}><strong>..</strong><small>Parent folder</small></button>}
      {listing.entries.map(entry => <button key={entry.directory} disabled={busy} onClick={() => navigate(entry.directory)}><strong>{entry.repository ? <GitBranch size={15} /> : <Folder size={15} />}{entry.name}</strong><small>{entry.registered ? 'Already registered' : entry.repository ? 'Git repository' : 'Folder'}</small></button>)}
      {!listing.entries.length && <p className="chat-muted">No visible subfolders. You can use this folder or enter another path.</p>}
      {listing.entries.length >= 500 && <p className="chat-muted">Showing the first 500 folders. Enter a more specific path to narrow the list.</p>}
    </div>}
    <footer><span>{busy ? 'Registering project…' : listing?.directory}</span><button className="chat-project-start" disabled={busy || loading || !listing || Boolean(error) || !listing.registered && listing.guilds.length > 1 && !guild} onClick={() => void start()}>{listing?.registered ? 'Start session here' : 'Add project & start session'}</button></footer>
  </section>
}
