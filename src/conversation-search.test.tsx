// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Dashboard } from './App'

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear() })
function mockSearch() {
  return vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ hits: [{ id: 'old', title: 'Buried thread', project: 'Project', threadId: '1561737719133114458', guildId: '1526236793048141935', updatedAt: 1, excerpt: 'hidden electron loading issue', matches: 1 }], indexing: false, indexed: 501, error: null }) }))
}
it('opens with double Space, focuses history search, searches beyond dashboard inventory and restores focus', async () => {
  mockSearch()
  render(<Dashboard snapshot={null} />)
  const trigger = screen.getByRole('button', { name: 'Search shortcuts' })
  trigger.focus(); trigger.blur()
  fireEvent.keyDown(document.body, { key: ' ', code: 'Space' })
  expect(screen.queryByRole('dialog')).toBeNull()
  fireEvent.keyDown(document.body, { key: ' ', code: 'Space' })
  expect(screen.getByRole('dialog', { name: 'Search conversations' })).toBeTruthy()
  const input = screen.getByRole('textbox', { name: 'Search conversation history' })
  expect(document.activeElement).toBe(input)
  fireEvent.change(input, { target: { value: 'electron' } })
  await screen.findByRole('link', { name: 'Buried thread' })
  expect(fetch).toHaveBeenCalledWith('/api/search?q=electron', expect.anything())
  expect(screen.getByText(/501 conversations indexed/)).toBeTruthy()
  expect(screen.getByText('electron').tagName).toBe('MARK')
  const link = screen.getByRole('link', { name: 'Buried thread' })
  const click = vi.fn((event: Event) => event.preventDefault())
  link.addEventListener('click', click)
  fireEvent.keyDown(input, { key: 'ArrowDown' })
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(click).toHaveBeenCalledOnce()
  fireEvent.keyDown(input, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).toBeNull()
})
it('does not capture spaces in text fields, on buttons, held keys or modified shortcuts', () => {
  render(<Dashboard snapshot={null} />)
  for (const target of [screen.getByRole('searchbox'), screen.getByRole('button', { name: 'Search shortcuts' })]) {
    fireEvent.keyDown(target, { key: ' ', code: 'Space' }); fireEvent.keyDown(target, { key: ' ', code: 'Space' })
  }
  for (const extra of [{ repeat: true }, { ctrlKey: true }, { isComposing: true }]) {
    fireEvent.keyDown(document.body, { key: ' ', ...extra }); fireEvent.keyDown(document.body, { key: ' ', ...extra })
  }
  fireEvent.keyDown(document.body, { key: ' ' }); fireEvent.keyDown(document.body, { key: 'x' }); fireEvent.keyDown(document.body, { key: ' ' })
  expect(screen.queryByRole('dialog')).toBeNull()
})
it('offers a clickable shortcut and reports network errors without stale results', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
  render(<Dashboard snapshot={null} />)
  const trigger = screen.getByRole('button', { name: 'Search shortcuts' })
  trigger.focus(); fireEvent.click(trigger)
  await screen.findByText('Search unavailable. Retrying…')
  fireEvent.click(screen.getByRole('button', { name: 'Close conversation search' }))
  await waitFor(() => expect(document.activeElement).toBe(trigger))
})
