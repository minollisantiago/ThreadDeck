import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowUpRight, Clock3, RefreshCw, SearchCheck, ShieldCheck, X } from 'lucide-react'
import { Button } from '../components/ui/button'
import { WorkspaceSectionsContext } from '../chat/sections'
import { SchedulesContext } from '../schedules/use-schedules'
import { useProposalsContext } from './use-proposals'
import { ProposalCharacter } from './character'
import './empty-state.css'

const discoveryInstruction = 'routines/daily-proposal-discovery.md'

export function ProposalEmptyState({ narrow, sidebar, projectCount }: { narrow: boolean; sidebar: () => void; projectCount: number }) {
  const proposals = useProposalsContext(), schedules = useContext(SchedulesContext), sections = useContext(WorkspaceSectionsContext)
  const [details, setDetails] = useState(false), [opening, setOpening] = useState(false), [scanError, setScanError] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  const task = schedules?.tasks.find(task => (task.prompt || task.preview).includes(discoveryInstruction))
  const unavailable = !proposals.available && Boolean(proposals.error)
  const loading = !proposals.loaded && !proposals.error
  const filtered = Boolean(proposals.query) || !['inbox', 'all'].includes(proposals.filter)
  useLayoutEffect(() => {
    if (!details) return
    const panel = dialog.current, previous = document.activeElement
    panel?.showModal()
    return () => { panel?.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus() }
  }, [details])
  useEffect(() => {
    if (!opening || !schedules || schedules.loading) return
    setOpening(false)
    if (!schedules.available) { setScanError(schedules.error || 'Discovery schedules are unavailable. Refresh schedules before running a scan.'); return }
    if (!task) { setScanError('No proposal discovery routine was found. Configure it in Schedules first.'); return }
    // Reuse the existing Run now confirmation and durable operation receipts.
    // Opening an empty inbox must never dispatch a real agent automatically.
    sections?.setSection('schedules')
    schedules.selectTask(task.id)
  }, [opening, schedules, task, sections])
  function openScan() {
    if (!schedules || !sections || schedules.locked || opening) return
    setScanError(''); setOpening(true)
    void schedules.refresh()
  }
  const title = unavailable ? 'Proposals unavailable' : loading ? 'Loading proposals…' : filtered ? 'No matching proposals' : !projectCount ? 'No projects available' : proposals.reviewedAt === null ? 'No proposals yet' : 'No new proposals'
  const description = unavailable ? 'Refresh proposals to check the connection.' : loading ? 'Reading the proposal inbox.' : filtered ? 'Try a different search or clear the filters.' : !projectCount ? 'Register a project or reconnect to view the project inventory.' : proposals.reviewedAt === null ? 'Scan your projects to check for improvements and issues.' : 'The last review did not leave any proposals in this inbox.'
  return <section className="proposal-empty-state" aria-labelledby="proposal-empty-heading">
    {!unavailable && !loading && <ProposalCharacter />}
    <h2 id="proposal-empty-heading">{title}</h2><p>{description}</p>
    <div className="proposal-empty-actions">
      {unavailable ? <Button variant="outline" disabled={proposals.loading} onClick={() => void proposals.refresh()}><RefreshCw size={14} />Refresh proposals</Button> : !loading && filtered ? <Button onClick={() => { proposals.setQuery(''); proposals.setFilter('inbox') }}>Clear filters</Button> : !loading && projectCount > 0 && <>
        <Button disabled={!schedules || !sections || opening || Boolean(schedules.locked)} onClick={openScan}><SearchCheck size={14} />{opening ? 'Opening scan routine…' : 'Scan projects'}</Button>
        <button className="proposal-empty-details" onClick={() => setDetails(true)}>Scan details <ArrowUpRight size={12} /></button>
      </>}
      {narrow && !loading && <button className="proposal-empty-details" onClick={sidebar}>Browse projects</button>}
    </div>
    {!unavailable && !loading && !filtered && projectCount > 0 && <>
      <p className="proposal-empty-safety"><ShieldCheck size={13} />Review and confirm the run in Schedules. Scans do not change code.</p>
      <div className="proposal-empty-review"><Clock3 size={13} /><span>{task?.status === 'planned' ? `Next scan: ${new Date(task.nextRunAt).toLocaleString()}` : proposals.reviewedAt === null ? 'No discovery scan recorded yet' : `Last review: ${new Date(proposals.reviewedAt).toLocaleString()}`}</span></div>
    </>}
    {scanError && <div className="proposals-error" role="alert">{scanError}{sections && <button className="proposal-empty-details" onClick={() => sections.setSection('schedules')}>Open schedules <ArrowUpRight size={12} /></button>}</div>}
    {details && <dialog ref={dialog} className="proposal-scan-details" aria-labelledby="proposal-scan-details-heading" onCancel={() => setDetails(false)}><header><h2 id="proposal-scan-details-heading">Scan details</h2><Button variant="ghost" size="icon" aria-label="Close scan details" onClick={() => setDetails(false)}><X size={17} /></Button></header><ol><li>Review recent changes, issues and active sessions in registered projects.</li><li>Check evidence and compare with existing proposals, snoozes and dismissals.</li><li>Add proposals to the inbox. Implementation needs a separate approval.</li></ol><p>Scan projects opens the configured discovery routine. Use its Run now action to review and confirm the dispatch.</p><Button variant="outline" onClick={() => setDetails(false)}>Close</Button></dialog>}
  </section>
}
