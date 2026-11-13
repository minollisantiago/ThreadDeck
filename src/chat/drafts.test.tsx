// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { useDraft } from './drafts'

beforeEach(() => { localStorage.clear() })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
it('does not issue storage requests for drafts that never had attachments', async () => {
  const fetch = vi.fn(async () => new Response('{"ok":true}'))
  vi.stubGlobal('fetch', fetch)
  const { result } = renderHook(() => useDraft('empty-storage-test'))
  act(() => result.current.save({ text: 'just text' }))
  await act(async () => {})
  expect(fetch).not.toHaveBeenCalled()
})
it('persists draft ownership and releases references when the final attachment is removed', async () => {
  const fetch = vi.fn(async () => new Response('{"ok":true}'))
  vi.stubGlobal('fetch', fetch)
  const { result } = renderHook(() => useDraft('attached-storage-test'))
  const id = crypto.randomUUID()
  act(() => result.current.save({ files: [{ id, name: 'image.png', available: true }] }))
  await waitFor(() => expect(fetch).toHaveBeenLastCalledWith('/api/chat/files/drafts', expect.objectContaining({ body: JSON.stringify({ owner: result.current.owner, ids: [id] }) })))
  act(() => result.current.save({ files: [] }))
  await waitFor(() => expect(fetch).toHaveBeenLastCalledWith('/api/chat/files/drafts', expect.objectContaining({ body: JSON.stringify({ owner: result.current.owner, ids: [] }) })))
})
it('retains server references if local persistence fails', async () => {
  const fetch = vi.fn(async () => new Response('{"ok":true}'))
  vi.stubGlobal('fetch', fetch)
  const { result } = renderHook(() => useDraft('failed-storage-test'))
  const id = crypto.randomUUID()
  act(() => result.current.save({ files: [{ id, name: 'image.png' }] }))
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
  const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Full') })
  try {
    act(() => result.current.save({ files: [] }))
    await act(async () => {})
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(result.current.storageError).toBe(true)
  } finally { set.mockRestore() }
})
