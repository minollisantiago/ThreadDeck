import { useEffect, useState } from 'react'
import { snapshotSchema, type Snapshot } from '../../shared/model'

export function useSnapshot() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [transportError, setTransportError] = useState(false)
  useEffect(() => {
    let cancelled = false, running = false
    let timer: ReturnType<typeof setTimeout>
    let controller: AbortController | undefined
    async function refresh() {
      if (running || cancelled) return
      running = true
      controller = new AbortController()
      try {
        const response = await fetch('/api/snapshot', {
          cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8_000)]),
        })
        if (!response.ok) throw new Error('Source unavailable')
        const next = snapshotSchema.parse(await response.json())
        if (!cancelled) { setSnapshot(next); setTransportError(false) }
      } catch { if (!cancelled) setTransportError(true) }
      finally {
        running = false
        if (!cancelled) timer = setTimeout(refresh, document.hidden ? 15_000 : 5_000)
      }
    }
    function visibility() {
      if (!document.hidden) { clearTimeout(timer); void refresh() }
    }
    void refresh()
    document.addEventListener('visibilitychange', visibility)
    return () => {
      cancelled = true; controller?.abort(); clearTimeout(timer)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [])
  return { snapshot, transportError }
}
