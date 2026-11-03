// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ChatMarkdown } from './markdown'

const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor)
  else Reflect.deleteProperty(navigator, 'clipboard')
})

it('soft-swaps to a double check after success and restores the copy icon after 1.8 seconds', async () => {
  vi.useFakeTimers()
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  render(<ChatMarkdown text={'```sh\necho copied\n```'} />)
  const button = screen.getByRole('button', { name: 'Copy code' })
  const icons = button.querySelector('.chat-code-copy-icons')
  expect(icons?.getAttribute('data-copied')).toBe('false')
  expect(button.querySelector('.lucide-check-check')).toBeTruthy()
  await act(async () => { fireEvent.click(button) })
  expect(screen.getByRole('button', { name: 'Code copied' })).toBe(button)
  expect(icons?.getAttribute('data-copied')).toBe('true')
  act(() => { vi.advanceTimersByTime(1800) })
  expect(screen.getByRole('button', { name: 'Copy code' })).toBe(button)
  expect(icons?.getAttribute('data-copied')).toBe('false')
})

it('reports a denied code copy and permits retry with the exact terminal command', async () => {
  const writeText = vi.fn().mockRejectedValueOnce(new Error('Clipboard denied')).mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  render(<ChatMarkdown text={'```bash\nnpm run build && echo "done"\n```'} />)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy code' })) })
  expect(screen.getByRole('status').textContent).toBe('Couldn’t copy code. Try again.')
  expect(screen.getByRole('status').closest('.chat-code')).toBeNull()
  expect(screen.getByRole('status').previousElementSibling?.classList.contains('chat-code')).toBe(true)
  expect(screen.queryByRole('button', { name: 'Code copied' })).toBeNull()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy code' })) })
  expect(writeText).toHaveBeenLastCalledWith('npm run build && echo "done"\n')
  expect(screen.getByRole('button', { name: 'Code copied' })).toBeTruthy()
  expect(screen.queryByRole('status')).toBeNull()
})

it('shows success only on the code block actually copied', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  render(<ChatMarkdown text={'```sh\necho first\n```\n\n```sh\necho second\n```'} />)
  await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: 'Copy code' })[1]) })
  expect(writeText).toHaveBeenCalledWith('echo second\n')
  expect(screen.getAllByRole('button', { name: 'Code copied' })).toHaveLength(1)
  expect(screen.getAllByRole('button', { name: 'Copy code' })).toHaveLength(1)
})
