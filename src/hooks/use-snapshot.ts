import { useEffect, useState } from 'react'
import { snapshotSchema, type Snapshot } from '../../shared/model'
import { reconciliationIntervalMs } from '../../shared/update-timing'

export function useSnapshot() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [transportError, setTransportError] = useState(false)
  useEffect(() => {
    let cancelled = false, running = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let controller: AbortController | undefined
    let stream: EventSource | undefined
    let streaming = false
    async function refresh() {
      if (running || cancelled) return
      timer = undefined
      running = true
      controller = new AbortController()
      try {
        const response = await fetch('/api/snapshot', {
          cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8_000)]),
        })
        if (!response.ok) throw new Error('Source unavailable')
        const next = snapshotSchema.parse(await response.json())
        if (!cancelled && !streaming) { setSnapshot(next); setTransportError(false) }
      } catch { if (!cancelled && !streaming) setTransportError(true) }
      finally {
        running = false
        if (!cancelled && !streaming) timer = setTimeout(refresh, reconciliationIntervalMs)
      }
    }
    function visibility() {
      if (!document.hidden && !streaming) { clearTimeout(timer); void refresh() }
    }
    if (typeof EventSource !== 'undefined') {
      stream = new EventSource('/api/events')
      stream.addEventListener('snapshot', event => {
        try {
          const next = snapshotSchema.parse(JSON.parse(event.data))
          streaming = true; clearTimeout(timer); timer = undefined; controller?.abort()
          setSnapshot(next); setTransportError(false)
        } catch { setTransportError(true) }
      })
      stream.onerror = () => {
        streaming = false; setTransportError(true)
        if (!timer) void refresh()
      }
    } else void refresh()
    document.addEventListener('visibilitychange', visibility)
    return () => {
      cancelled = true; stream?.close(); controller?.abort(); clearTimeout(timer)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [])
  return { snapshot, transportError }
}
