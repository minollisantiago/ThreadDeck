import { useLayoutEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowUpRight, Check, Clock3, FileCode2, Lightbulb, MessageSquare, Play, RefreshCw, ShieldCheck, X } from 'lucide-react'
import type { Project, Session } from '../../shared/model'
import { pendingLaunch, proposalApproaches, proposalStatuses, type ProposalApproach, type ProposalStatus } from '../../shared/proposals'
import { Button } from '../components/ui/button'
import { TooltipHint } from '../components/ui/tooltip'
import { SidebarToggle } from '../chat/sidebar-toggle'
import { useProposalsContext } from './use-proposals'
import { ProposalBadge } from './sidebar'

function Evidence({ reference }: { reference: string }) {
  try { const url = new URL(reference); if (url.protocol === 'https:' || url.protocol === 'http:') return <a href={url.href} target="_blank" rel="noreferrer">{reference}<ArrowUpRight size={12} /></a> } catch { /* File and code references stay plain text. */ }
  return <code>{reference}</code>
}
export function ProposalPane({ projects, open, sidebar, sidebarOpen, narrow }: { projects: Project[]; open: (session: Session) => void; sidebar: () => void; sidebarOpen: boolean; narrow: boolean }) {
  const workspace = useProposalsContext()
  const p = workspace.proposals.find(p => p.id === workspace.selectedId)
  const project = projects.find(project => project.id === p?.projectId)
  const [editor, setEditor] = useState(false), [prompt, setPrompt] = useState(''), [approach, setApproach] = useState<ProposalApproach>('plan')
  const [reason, setReason] = useState(''), [actionError, setActionError] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  const requestId = useRef<string | null>(null)
  useLayoutEffect(() => {
    const panel = dialog.current, previous = document.activeElement
    if (editor) panel?.showModal()
    return () => { panel?.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus() }
  }, [editor])
  useLayoutEffect(() => { setEditor(false); setReason(''); setActionError('') }, [p?.id])
  const guarded = p ? pendingLaunch(p) : false
  const disabled = !workspace.available || workspace.busy || !project
  async function decide(status: Exclude<ProposalStatus, 'progress'>) {
    if (!p) return
    setActionError('')
    try { await workspace.mutate({ action: 'decide', id: p.id, revision: p.revision, status, reason, ...(status === 'snoozed' && { snoozedUntil: Date.now() + 24 * 60 * 60 * 1000 }) }) }
    catch (error) { setActionError(error instanceof Error ? error.message : 'Decision could not be saved.') }
  }
  function openSession() {
    if (!p?.session || !project) return
    open(project.sessions.find(session => session.id === p.session!.id) || { id: p.session.id, threadId: p.session.threadId, projectId: project.id, guildId: project.sessions[0]?.guildId || null, title: p.title, status: 'idle', agentCount: 0, updatedAt: p.updatedAt })
  }
  function closeEditor() {
    if (workspace.busy) return
    if (prompt !== p?.prompt && !window.confirm('Discard your edited starting prompt?')) return
    setEditor(false)
  }
  async function launch(event: React.FormEvent) {
    event.preventDefault(); if (!p || !requestId.current) return
    setActionError('')
    try {
      await workspace.mutate({ action: 'launch', id: p.id, revision: p.revision, requestId: requestId.current, prompt, approach })
      setEditor(false)
    } catch (error) { setActionError(error instanceof Error ? error.message : 'Delivery is uncertain. Refresh before trying again.') }
  }
  async function reconcile() {
    if (!p?.launch) return
    try { await workspace.mutate({ action: 'reconcile', id: p.id, requestId: p.launch.id }); setActionError('') }
    catch (error) { setActionError(error instanceof Error ? error.message : 'Cannot check delivery.') }
  }
  return <main className="chat-pane proposal-pane"><header className="chat-pane-header">{narrow && !sidebarOpen && <SidebarToggle open={sidebarOpen} toggle={sidebar} />}<div><span className="chat-channel-name"><span className="channel-hash">#</span>{project?.name || 'Proposals'}</span><strong className="chat-thread-title">{p?.title || 'Choose a proposal'}</strong></div><TooltipHint label="Refresh proposals"><Button variant="ghost" size="icon" aria-label="Refresh proposals" disabled={workspace.busy || workspace.loading} onClick={() => void workspace.refresh()}><RefreshCw size={15} /></Button></TooltipHint></header>
    <div className="chat-transcript proposal-document">{p ? <article className="proposal-page" key={p.id}><div className="proposal-kicker"><Lightbulb size={14} />PROPOSAL <span>Reviewed {new Date(p.reviewedAt).toLocaleDateString()}</span><ProposalBadge proposal={p} /></div><h2>{p.title}</h2><p className="proposal-lede">{p.summary}</p>
      {!project && <div className="proposals-error" role="alert">This project is not in the connected inventory. Session launch is disabled.</div>}
      <div className="proposal-facts"><div><span>KIND</span><strong>{p.kind === 'observed' ? 'Observed opportunity' : 'New idea'}</strong></div><div><span>EFFORT</span><strong>{p.effort === 'explore' ? 'Explore first' : p.effort[0].toUpperCase() + p.effort.slice(1)}</strong></div><div><span>PROJECT / CHANNEL</span><strong># {project?.name || p.projectId}</strong></div></div>
      {p.status === 'snoozed' && <div className="proposal-state-note"><Clock3 size={15} />Snoozed until {new Date(p.snoozedUntil!).toLocaleString()}. It returns to the inbox automatically.</div>}
      {p.status === 'dismissed' && <div className="proposal-state-note"><X size={15} />Dismissed. Discovery will retain this decision.{p.decisionReason && <span>{p.decisionReason}</span>}</div>}
      {p.status === 'done' && <div className="proposal-state-note"><Check size={15} />Marked done by you, not inferred from agent activity.</div>}
      <h3>Why consider this?</h3><p className="proposal-body-text">{p.rationale}</p><h3>Evidence and starting points</h3><div className="proposal-evidence">{p.evidence.map((item, index) => <div key={`${index}:${item.reference}`}><FileCode2 size={15} /><div><span>{item.label}</span><Evidence reference={item.reference} /></div></div>)}</div><div className="proposal-evidence-note"><ShieldCheck size={15} /><span>{p.kind === 'idea' ? 'A product exploration, not a validated requirement.' : 'Verify the cited evidence before changing code; an opportunity is not necessarily a confirmed defect.'}</span></div>
      {p.session && <section className="proposal-linked-session"><div><MessageSquare size={16} /><span>{p.status === 'done' ? 'OUTCOME SESSION' : 'LINKED SESSION'}</span></div><button disabled={!project} onClick={openSession}>{p.title}<ArrowUpRight size={15} /></button><p>Continue this conversation instead of starting duplicate work.</p></section>}
      <div className="proposal-section-heading"><h3>{p.session && p.launch ? 'Submitted prompt' : 'Starting prompt'}</h3><span>{p.session && p.launch ? proposalApproaches[p.launch.approach] : 'Editable before launch'}</span></div><div className="proposal-instruction">{p.launch && p.launch.resolvedAt === null ? p.launch.prompt : p.prompt}</div>
      {guarded && p.launch && <section className="proposal-delivery" role="status"><strong>Session delivery: {p.launch.receipt.state}</strong><p>{p.launch.receipt.error || 'Waiting for a confirmed session link. Do not start another session.'}</p><small>Operation {p.launch.id}</small><div><Button variant="outline" disabled={disabled} onClick={() => void reconcile()}>Check delivery status</Button>{['unknown', 'failed'].includes(p.launch.receipt.state) && <Button variant="outline" disabled={disabled} onClick={async () => {
        if (!window.confirm('Check Discord and operation status first. This does not undo a session already created. Only resolve if it is safe to allow another launch.')) return
        try { await workspace.mutate({ action: 'resolve', id: p.id, requestId: p.launch!.id, checked: true }) } catch (error) { setActionError(error instanceof Error ? error.message : 'Cannot resolve delivery.') }
      }}>Resolve delivery guard…</Button>}</div></section>}
      {p.launch?.receipt.state === 'submitted' && <p className="proposal-action-note">Session created using “{proposalApproaches[p.launch.approach]}”. Your submitted prompt is retained with the launch record.</p>}
      <section className="proposal-actions-section" aria-label="Proposal actions">{p.status === 'inbox' && !p.session && <label className="proposal-reason">Decision note <span>optional</span><input maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} placeholder="Context for snoozing or dismissing…" /></label>}<div className="proposal-document-actions">{p.session && <Button disabled={!project || workspace.busy} onClick={openSession}><MessageSquare size={13} />Open session</Button>}{p.status === 'inbox' && !p.session ? <><Button disabled={disabled || guarded} onClick={() => { setPrompt(p.prompt); setApproach('plan'); requestId.current = crypto.randomUUID(); setEditor(true) }}><Play size={13} />Start session</Button><Button variant="outline" disabled={disabled || guarded} onClick={() => void decide('snoozed')}><Clock3 size={13} />Snooze for 24 hours</Button><Button variant="ghost" disabled={disabled || guarded} onClick={() => void decide('dismissed')}>Dismiss</Button></> : p.status === 'progress' ? <Button variant="outline" disabled={disabled || guarded} onClick={() => void decide('done')}><Check size={13} />Mark done</Button> : <Button variant="outline" disabled={disabled || guarded} onClick={() => void decide('inbox')}><ArrowLeft size={13} />Return to inbox</Button>}</div><p className="proposal-action-note">{p.status === 'inbox' ? 'Review the initial prompt before launching. Existing conversation drafts are not changed.' : p.decisionReason || 'Your decision is remembered across discovery runs.'}</p></section>
      {workspace.filter !== 'all' && workspace.filter !== p.status && <button className="proposal-view-status" onClick={() => workspace.setFilter(p.status)}>View {proposalStatuses[p.status].toLowerCase()} proposals <ArrowUpRight size={12} /></button>}
      {(actionError || workspace.error) && <div className="proposals-error" role="alert">{actionError || workspace.error}</div>}
    </article> : <div className="proposal-empty"><Lightbulb size={30} /><h2>{workspace.loading ? 'Loading proposals…' : 'Choose a proposal'}</h2><p>Select an idea under its project, or wait for the next discovery review.</p>{narrow && <Button variant="outline" onClick={sidebar}>Browse projects</Button>}</div>}</div>
    {editor && p && <dialog ref={dialog} className="proposal-launch-editor" aria-labelledby="proposal-launch-title" onCancel={event => { event.preventDefault(); closeEditor() }}><form onSubmit={launch}><header><div><span># {project?.name} / NEW SESSION</span><h2 id="proposal-launch-title">Start from this proposal</h2></div><Button type="button" variant="ghost" size="icon" aria-label="Close start dialog" disabled={workspace.busy} onClick={closeEditor}><X size={17} /></Button></header><div className="proposal-editor-body"><p>{p.title}</p><label>Approach<select disabled={workspace.busy} value={approach} onChange={event => setApproach(event.target.value as ProposalApproach)}>{Object.entries(proposalApproaches).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Initial prompt<textarea autoFocus required maxLength={40_000} rows={9} disabled={workspace.busy} value={prompt} onChange={event => setPrompt(event.target.value)} /></label><p className="proposal-editor-note">Creates a real agent session and Discord thread in this project. The chosen approach is included in the initial prompt.</p>{(actionError || workspace.error) && <div className="proposals-error" role="alert">{actionError || workspace.error}<Button type="button" variant="outline" disabled={workspace.loading || workspace.busy} onClick={() => { setEditor(false); void workspace.refresh() }}>Close and check delivery</Button></div>}</div><footer><Button type="button" variant="outline" disabled={workspace.busy} onClick={closeEditor}>Cancel</Button><Button type="submit" disabled={disabled || !prompt.trim() || guarded}><Play size={13} />{workspace.busy ? 'Starting…' : 'Start session'}</Button></footer></form></dialog>}
  </main>
}
