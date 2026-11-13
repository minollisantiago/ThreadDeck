// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { UploadStorage } from './upload-storage'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })
const status = { used: 1024 ** 2, reclaimable: 0, protected: 1024 ** 2, count: 128, budget: 2 * 1024 ** 3 }
it('loads storage on demand and invokes only the safe cleanup endpoint', async () => {
  const fetch = vi.fn(async () => new Response(JSON.stringify(status)))
  vi.stubGlobal('fetch', fetch)
  const { container } = render(<UploadStorage />)
  expect(fetch).not.toHaveBeenCalled()
  const details = container.querySelector('details')!
  details.open = true; fireEvent(details, new Event('toggle'))
  expect(await screen.findByText(/1.0 MiB \/ 2048.0 MiB/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Clean unused files' }))
  await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/chat/storage/clean', expect.objectContaining({ method: 'POST' })))
})
it('shows storage errors without discarding the composer draft', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Storage unavailable' }), { status: 503 })))
  const { container } = render(<UploadStorage />)
  const details = container.querySelector('details')!
  details.open = true; fireEvent(details, new Event('toggle'))
  expect((await screen.findByRole('alert')).textContent).toBe('Storage unavailable')
})
