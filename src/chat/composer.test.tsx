// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { PromptComposer } from './composer'

afterEach(() => { cleanup(); localStorage.clear() })

const props = {
  draft: { text: 'Hello', anchor: 5, head: 5, revision: 'test', files: [] }, change: vi.fn(), expanded: false, toggle: vi.fn(),
  enabled: true, busy: false, pending: false, catalog: { entries: [] }, submit: vi.fn(), stop: vi.fn(),
}

it('explains the expand composer button and keyboard shortcut on focus', async () => {
  render(<PromptComposer {...props} />)
  await act(async () => { screen.getByRole('button', { name: 'Expand composer' }).focus() })
  const tooltip = await screen.findByRole('tooltip')
  expect(tooltip.textContent).toContain('Expand composer')
  expect(tooltip.textContent).toContain('Ctrl P · P')
})

it('keeps send and queue icon-only with accessible names and delivery behavior', () => {
  const submit = vi.fn()
  const { rerender } = render(<PromptComposer {...props} submit={submit} />)
  const send = screen.getByRole('button', { name: 'Send' })
  expect(send.textContent).toBe('')
  expect(send.querySelector('svg')).toBeTruthy()
  fireEvent.click(send)
  expect(submit).toHaveBeenLastCalledWith('send')
  rerender(<PromptComposer {...props} submit={submit} busy />)
  const queue = screen.getByRole('button', { name: 'Queue' })
  expect(queue.textContent).toBe('')
  fireEvent.click(queue)
  expect(submit).toHaveBeenLastCalledWith('queue')
  rerender(<PromptComposer {...props} pending />)
  const pending = screen.getByRole('button', { name: 'Pending…' })
  expect(pending.textContent).toBe('')
  expect(pending.hasAttribute('disabled')).toBe(true)
})
