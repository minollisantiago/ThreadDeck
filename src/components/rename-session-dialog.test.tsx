// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { SessionRow } from './session-row'
import type { Session } from '../../shared/model'

const session: Session = { id: 'ses_test', projectId: 'p', threadId: '100000000000000001', guildId: null, title: 'Original', status: 'working', agentCount: 1, updatedAt: 1 }
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute('open', '') } })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute('open') } })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal'); Reflect.deleteProperty(HTMLDialogElement.prototype, 'close') })
function setup() {
  const markRead = vi.fn()
  const view = render(<SessionRow session={session} verified now={100} unread markRead={markRead} />)
  const row = screen.getByText('Original').closest('.session-row')!
  fireEvent.contextMenu(row)
  fireEvent.click(screen.getByRole('menuitem', { name: 'Rename…' }))
  return { ...view, markRead, row }
}
it('opens rename only from the context menu, selects the current title and restores focus on cancel', () => {
  const { row, markRead } = setup()
  const input = screen.getByRole('textbox', { name: 'Name' }) as HTMLInputElement
  expect(input.value).toBe('Original')
  expect(document.activeElement).toBe(input)
  expect(input.selectionEnd).toBe('Original'.length)
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: false, cancelable: true }))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(document.activeElement).toBe(row)
  expect(markRead).not.toHaveBeenCalled()
})
it('saves a trimmed title without optimistic overrides and then accepts agent renames', async () => {
  const request = vi.fn(async () => new Response('{}'))
  vi.stubGlobal('fetch', request)
  const { rerender, markRead } = setup()
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '  Manual title  ' } })
  fireEvent.submit(screen.getByRole('button', { name: 'Save' }).closest('form')!)
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(request).toHaveBeenCalledExactlyOnceWith('/api/sessions/ses_test/rename', expect.objectContaining({ body: JSON.stringify({ title: 'Manual title' }) }))
  rerender(<SessionRow session={{ ...session, title: 'Agent renamed this' }} verified now={100} unread markRead={markRead} />)
  expect(screen.getByText('Agent renamed this')).toBeTruthy()
  expect(markRead).not.toHaveBeenCalled()
})
it('retains input and shows partial failure without automatically retrying', async () => {
  const request = vi.fn(async () => new Response(JSON.stringify({ error: 'Discord may not be synchronized.' }), { status: 503 }))
  vi.stubGlobal('fetch', request)
  setup()
  const input = screen.getByRole('textbox') as HTMLInputElement
  fireEvent.change(input, { target: { value: 'Requested name' } })
  fireEvent.submit(screen.getByRole('button', { name: 'Save' }).closest('form')!)
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Discord may not be synchronized.')
  expect(input.value).toBe('Requested name')
  expect(request).toHaveBeenCalledTimes(1)
})
it('disables saving empty or oversized names', () => {
  setup()
  for (const value of ['   ', 'a'.repeat(101)]) {
    fireEvent.change(screen.getByRole('textbox'), { target: { value } })
    expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(true)
  }
})
