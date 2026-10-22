// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useSnapshot } from './use-snapshot'

const snapshot = { projects: [], health: 'connected', checkedAt: 123, lastSuccessAt: 123, attentionAvailable: true, inventoryLimited: false, message: null }
class Stream extends EventTarget {
  static instances: Stream[] = []
  onerror: (() => void) | null = null
  close = vi.fn()
  constructor(readonly url: string) { super(); Stream.instances.push(this) }
  snapshot(data: unknown) { this.dispatchEvent(new MessageEvent('snapshot', { data: JSON.stringify(data) })) }
}
afterEach(() => { cleanup(); Stream.instances = []; vi.unstubAllGlobals(); vi.useRealTimers() })
function setup() {
  vi.stubGlobal('EventSource', Stream)
  const fetcher = vi.fn(async () => new Response(JSON.stringify(snapshot)))
  vi.stubGlobal('fetch', fetcher)
  const hook = renderHook(useSnapshot)
  return { ...hook, fetcher, stream: Stream.instances[0] }
}
it('receives validated snapshots without polling and closes on unmount', () => {
  const { result, stream, fetcher, unmount } = setup()
  expect(stream.url).toBe('/api/events')
  act(() => stream.snapshot(snapshot))
  expect(result.current.snapshot).toEqual(snapshot)
  expect(fetcher).not.toHaveBeenCalled()
  act(() => stream.snapshot({ invalid: true }))
  expect(result.current.snapshot).toEqual(snapshot)
  expect(result.current.transportError).toBe(true)
  act(() => stream.snapshot({ ...snapshot, checkedAt: 456 }))
  expect(result.current.transportError).toBe(false)
  unmount(); expect(stream.close).toHaveBeenCalledOnce()
})
it('falls back to HTTP on stream failure and stops polling when SSE recovers', async () => {
  vi.useFakeTimers()
  const { result, stream, fetcher } = setup()
  await act(async () => { stream.onerror?.() })
  expect(result.current.snapshot).toEqual(snapshot)
  expect(fetcher).toHaveBeenCalledOnce()
  await act(async () => { stream.onerror?.() })
  expect(fetcher).toHaveBeenCalledOnce()
  await act(() => vi.advanceTimersByTimeAsync(30_000))
  expect(fetcher).toHaveBeenCalledTimes(2)
  act(() => stream.snapshot({ ...snapshot, checkedAt: 456 }))
  await act(() => vi.advanceTimersByTimeAsync(60_000))
  expect(fetcher).toHaveBeenCalledTimes(2)
})
it('uses HTTP when EventSource is unavailable', async () => {
  vi.stubGlobal('EventSource', undefined)
  const fetcher = vi.fn(async () => new Response(JSON.stringify(snapshot)))
  vi.stubGlobal('fetch', fetcher)
  const { result } = renderHook(useSnapshot)
  await waitFor(() => expect(result.current.snapshot).toEqual(snapshot))
})
