// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { HtmlPreview } from './html-preview'

const html = '<h1>Attachment</h1><script>document.body.dataset.active = "yes"</script>'
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute('open', '') } })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute('open') } })
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(html))))
})
afterEach(() => {
  cleanup(); vi.unstubAllGlobals()
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal'); Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
})
function frame() { return screen.getByTitle('study.html') }
async function loaded() { await waitFor(() => expect(frame().getAttribute('srcdoc')).toContain('Attachment')) }

it('asks before enabling scripts and defaults to safe static preview on refusal', async () => {
  render(<HtmlPreview name="study.html" url="/file" close={vi.fn()} />)
  expect(screen.getByRole('dialog').hasAttribute('open')).toBe(true)
  await act(async () => { await Promise.resolve() })
  expect(screen.queryByTitle('study.html')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Use safe static preview' }))
  await loaded()
  expect(frame().getAttribute('sandbox')).toBe('')
  expect(frame().getAttribute('srcdoc')).not.toContain('<script>')
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(frame().hasAttribute('inert')).toBe(true)
})

it('enables original HTML only after consent, keeps origin isolation, and supports revoking trust', async () => {
  render(<HtmlPreview name="study.html" url="/file" close={vi.fn()} />)
  expect(screen.queryByTitle('study.html')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Trust and open interactive preview' }))
  await loaded()
  expect(frame().getAttribute('srcdoc')).toBe(html)
  expect(frame().getAttribute('sandbox')).toBe('allow-scripts')
  expect(frame().hasAttribute('inert')).toBe(false)
  expect(frame().getAttribute('referrerpolicy')).toBe('no-referrer')
  fireEvent.click(screen.getByRole('button', { name: 'Switch to safe preview' }))
  expect(frame().getAttribute('sandbox')).toBe('')
  expect(frame().getAttribute('srcdoc')).not.toContain('<script>')
  fireEvent.click(screen.getByRole('button', { name: 'Enable interactive preview…' }))
  expect(screen.getByRole('dialog')).toBeTruthy()
  expect(screen.queryByTitle('study.html')).toBeNull()
})

it('treats Escape as declining and never carries consent or old HTML to another file', async () => {
  const close = vi.fn()
  const { rerender } = render(<HtmlPreview name="study.html" url="/first" close={close} />)
  expect(screen.queryByTitle('study.html')).toBeNull()
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
  await loaded()
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(close).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Enable interactive preview…' }))
  fireEvent.click(screen.getByRole('button', { name: 'Trust and open interactive preview' }))
  rerender(<HtmlPreview name="study.html" url="/second" close={close} />)
  expect(screen.getByRole('dialog')).toBeTruthy()
  expect(screen.queryByTitle('study.html')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Use safe static preview' }))
  await loaded()
  expect(frame().getAttribute('sandbox')).toBe('')
})
