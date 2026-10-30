// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CopyMessage } from './copy-message'

const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
afterEach(() => {
  cleanup()
  if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor)
  else Reflect.deleteProperty(navigator, 'clipboard')
})

it('puts Markdown-copy failures beside the copy button and permits retry', async () => {
  const writeText = vi.fn().mockRejectedValueOnce(new Error('Clipboard denied')).mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  const markdown = '## Report\n\n```sh\necho done\n```'
  render(<CopyMessage markdown={markdown} />)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy Markdown' })) })
  const warning = screen.getByRole('status')
  expect(warning.textContent).toBe('Couldn’t copy Markdown. Try again.')
  expect(warning.closest('.chat-message-actions')).not.toBeNull()
  expect(warning.previousElementSibling).toBe(screen.getByRole('button', { name: 'Copy Markdown' }))
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy Markdown' })) })
  expect(writeText).toHaveBeenLastCalledWith(markdown)
  expect(screen.getByRole('status').textContent).toBe('Markdown copied')
  expect(screen.queryByText('Couldn’t copy Markdown. Try again.')).toBeNull()
})
