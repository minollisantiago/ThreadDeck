import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { scheduleMutationSchema, scheduleOperationSchema, schedulesResponseSchema, type Schedule, type ScheduleMutation, type ScheduleOperation } from '../../shared/schedules'

const pendingKey = 'threaddeck:schedule-operation:v1'
function savedOperation(): string | null { try { const id = localStorage.getItem(pendingKey); return id && /^[a-f0-9-]{36}$/.test(id) ? id : null } catch { return null } }
function remember(id: string | null) { try { if (id) localStorage.setItem(pendingKey, id); else localStorage.removeItem(pendingKey) } catch { /* in-memory receipt still works */ } }
function latest(current: ScheduleOperation | null, next: ScheduleOperation) {
  if (current?.id === next.id && (current.updatedAt > next.updatedAt || !['accepted', 'running'].includes(current.state) && ['accepted', 'running'].includes(next.state))) return current
  return next
}
async function request(url: string, options?: RequestInit) {
  const response = await fetch(`/api/schedules${url}`, options)
  const value = await response.json()
  if (!response.ok) throw new Error(value.error || 'Schedules are unavailable')
  return value
}
export type ScheduleEditorTarget = { projectId: string; schedule?: Schedule }
export function useSchedules() {
  const [section, setSection] = useState<'threads' | 'schedules'>('threads')
  const [tasks, setTasks] = useState<Schedule[]>([]), [selectedId, setSelectedId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false), [available, setAvailable] = useState(false), [error, setError] = useState('')
  const [checkedAt, setCheckedAt] = useState<number | null>(null)
  const [editor, setEditor] = useState<ScheduleEditorTarget | null>(null)
  const [operationId, setOperationId] = useState(savedOperation)
  const activeOperationId = useRef(operationId)
  const [operation, setOperation] = useState<ScheduleOperation | null>(null), [operationError, setOperationError] = useState('')
  const locked = operationId !== null && (!operation || ['accepted', 'running', 'unknown'].includes(operation.state))
  const inFlight = useRef(false), refreshAgain = useRef(false), mutationLock = useRef(false), mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const refresh = useCallback(async (): Promise<void> => {
    if (inFlight.current) { refreshAgain.current = true; return }
    inFlight.current = true; setLoading(true)
    try {
      const value = schedulesResponseSchema.parse(await request('', { signal: AbortSignal.timeout(12_000) }))
      if (!mounted.current) return
      setTasks(value.schedules); setCheckedAt(Date.now()); setAvailable(true); setError('')
      setSelectedId(previous => previous !== null && value.schedules.some(task => task.id === previous) ? previous : value.schedules[0]?.id ?? null)
    } catch (error) { if (mounted.current) { setError(error instanceof Error ? error.message : 'Schedules are unavailable'); setAvailable(false) } }
    finally {
      inFlight.current = false
      if (mounted.current) { setLoading(false); if (refreshAgain.current) { refreshAgain.current = false; void refresh() } }
    }
  }, [])
  useEffect(() => {
    if (section !== 'schedules') return
    setAvailable(false)
    void refresh()
    const timer = setInterval(() => void refresh(), 15_000)
    const visible = () => { if (document.visibilityState === 'visible') { setAvailable(false); void refresh() } }
    document.addEventListener('visibilitychange', visible)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', visible) }
  }, [section, refresh])
  const checkOperation = useCallback(async (id: string) => {
    try {
      const value = scheduleOperationSchema.parse(await request(`/operations/${id}`, { signal: AbortSignal.timeout(12_000) }))
      if (value.id !== id) throw new Error('Kimaki returned a different operation receipt')
      if (!mounted.current || activeOperationId.current !== id) return
      setOperation(previous => latest(previous, value)); setOperationError('')
      if (['succeeded', 'failed', 'unknown'].includes(value.state)) void refresh()
    } catch (error) { if (mounted.current && activeOperationId.current === id) setOperationError(`${error instanceof Error ? error.message : 'Operation status unavailable'}. Do not automatically repeat this operation.`) }
  }, [refresh])
  useEffect(() => {
    if (!operationId) return
    if (operation && ['succeeded', 'failed', 'unknown'].includes(operation.state)) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    const tick = async () => { await checkOperation(operationId); if (!cancelled) timer = setTimeout(tick, 2000) }
    void tick()
    return () => { cancelled = true; clearTimeout(timer) }
  }, [operationId, operation?.state, checkOperation])
  async function submit(input: Omit<Extract<ScheduleMutation, { action: 'create' }>, 'requestId'> | Omit<Extract<ScheduleMutation, { action: 'edit' }>, 'requestId'> | Omit<Extract<ScheduleMutation, { action: 'run' | 'delete' }>, 'requestId'>, onRequest?: (id: string) => void) {
    if (mutationLock.current || locked) throw new Error('Check the current schedule operation before starting another')
    if (!available) throw new Error('Refresh schedules successfully before making changes')
    const parsed = scheduleMutationSchema.safeParse({ ...input, requestId: crypto.randomUUID() })
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || 'Invalid schedule fields')
    const value = parsed.data
    mutationLock.current = true
    activeOperationId.current = value.requestId
    remember(value.requestId); setOperationId(value.requestId); setOperationError('')
    // This is optimistic UI, not a bot receipt. Its clock must not outrank an
    // authoritative response (including after clock skew or a fake test clock).
    setOperation({ id: value.requestId, action: value.action, state: 'accepted', updatedAt: 0 })
    // Forms follow this ID even when the POST response is lost. A later success
    // receipt must close the original form, not invite a duplicate submission.
    onRequest?.(value.requestId)
    try {
      const receipt = scheduleOperationSchema.parse(await request('', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value), signal: AbortSignal.timeout(15_000) }))
      if (receipt.id !== value.requestId) throw new Error('Kimaki returned a different operation receipt')
      if (mounted.current && activeOperationId.current === value.requestId) { setOperation(previous => latest(previous, receipt)); if (receipt.state === 'succeeded') void refresh() }
      return receipt
    } catch {
      if (mounted.current) setOperationError('Delivery of this operation could not be confirmed. Check its status and inspect schedules/Discord before trying again.')
      // Keep the receipt ID even if the POST response was lost. Never re-submit.
      throw new Error('The outcome is not yet confirmed. Your inputs are retained; use Check operation status before trying again.')
    } finally { mutationLock.current = false }
  }
  function dismissOperation() { activeOperationId.current = null; remember(null); setOperationId(null); setOperation(null); setOperationError('') }
  return { section, setSection, tasks, selectedId, select: setSelectedId, loading, available, error, checkedAt, refresh, editor, setEditor, operationId, operation, operationError: operation?.state === 'succeeded' || operation?.state === 'failed' ? '' : operationError, locked, submit, checkOperation, dismissOperation }
}
export type Schedules = ReturnType<typeof useSchedules>
export const SchedulesContext = createContext<(Schedules & { selectTask: (id: number) => void }) | null>(null)
export function useSchedulesContext() { const value = useContext(SchedulesContext); if (!value) throw new Error('Schedules workspace unavailable'); return value }
