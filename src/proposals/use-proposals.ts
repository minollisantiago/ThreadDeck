import { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react'
import { proposalsResponseSchema, type Proposal, type ProposalMutation, type ProposalStatus } from '../../shared/proposals'

export type ProposalFilter = ProposalStatus | 'all'
async function request(input?: ProposalMutation) {
  const response = await fetch('/api/proposals', input ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal: AbortSignal.timeout(40_000) } : { signal: AbortSignal.timeout(12_000) })
  const value = await response.json()
  if (!response.ok) throw new Error(value.error || 'Proposals unavailable')
  return proposalsResponseSchema.parse(value)
}
export function useProposals(active: boolean) {
  const [proposals, setProposals] = useState<Proposal[]>([]), [reviewedAt, setReviewedAt] = useState<number | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filter, setFilter] = useState<ProposalFilter>('inbox'), [query, setQuery] = useState('')
  const [available, setAvailable] = useState(false), [loaded, setLoaded] = useState(false), [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const lock = useRef(false), reading = useRef(false), generation = useRef(0), mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const apply = useCallback((value: ReturnType<typeof proposalsResponseSchema.parse>) => {
    setProposals(value.proposals); setReviewedAt(value.reviewedAt); setAvailable(true); setLoaded(true); setError('')
    setSelectedId(previous => value.proposals.some(p => p.id === previous) ? previous : value.proposals.find(p => p.status === 'inbox')?.id || value.proposals[0]?.id || null)
  }, [])
  const refresh = useCallback(async () => {
    if (lock.current || reading.current) return
    reading.current = true; setLoading(true)
    const version = generation.current
    try { const value = await request(); if (mounted.current && generation.current === version) apply(value) }
    catch (error) { if (mounted.current && generation.current === version) { setAvailable(false); setError(error instanceof Error ? error.message : 'Proposals unavailable') } }
    finally { reading.current = false; if (mounted.current) setLoading(false) }
  }, [apply])
  useEffect(() => {
    if (!active) return
    void refresh()
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void refresh() }, 15_000)
    const focus = () => { void refresh() }
    window.addEventListener('focus', focus)
    return () => { clearInterval(timer); window.removeEventListener('focus', focus) }
  }, [active, refresh])
  const mutate = useCallback(async (input: ProposalMutation) => {
    if (lock.current) throw new Error('Wait for the current proposal operation.')
    if (!available) throw new Error('Refresh proposals successfully before making changes.')
    lock.current = true; generation.current++; setBusy(true); setError('')
    try { const value = await request(input); if (mounted.current) apply(value); return value }
    catch (error) { if (mounted.current) { setAvailable(false); setError(error instanceof Error ? error.message : 'Operation could not be confirmed. Refresh before retrying.') } throw error }
    finally { lock.current = false; if (mounted.current) setBusy(false) }
  }, [available, apply])
  const pending = proposals.find(p => p.launch && p.launch.resolvedAt === null && !['submitted', 'unknown', 'failed'].includes(p.launch.receipt.state))
  useEffect(() => {
    if (!active || !available || !pending?.launch) return
    const id = pending.id, requestId = pending.launch.id
    const timer = setTimeout(() => { void mutate({ action: 'reconcile', id, requestId }).catch(() => {}) }, 2000)
    return () => clearTimeout(timer)
  }, [active, available, pending, mutate])
  return { proposals, reviewedAt, selectedId, select: setSelectedId, filter, setFilter, query, setQuery, available, loaded, loading, busy, error, refresh, mutate }
}
export type Proposals = ReturnType<typeof useProposals>
export const ProposalsContext = createContext<(Proposals & { selectProposal: (id: string) => void }) | null>(null)
export function useProposalsContext() { const value = useContext(ProposalsContext); if (!value) throw new Error('Proposal workspace unavailable'); return value }
