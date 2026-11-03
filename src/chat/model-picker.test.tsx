// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ModelPicker } from './model-picker'
import { chatRequest } from './api'

vi.mock('./api', () => ({ chatRequest: vi.fn() }))
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
  vi.mocked(chatRequest).mockResolvedValue({ current: { providerID: 'test', id: 'one', variant: 'medium' }, models: [{ providerID: 'test', id: 'one', name: 'First model', variants: ['medium', 'high'] }, { providerID: 'other', id: 'two', name: 'Second model', variants: [] }] })
})
afterEach(() => { cleanup(); vi.clearAllMocks() })
it('selects enabled models and variants without sending until Apply', async () => {
  const apply = vi.fn(), close = vi.fn()
  render(<ModelPicker threadId="100000000000000001" command="models" arguments="" close={close} apply={apply} />)
  await screen.findByRole('button', { name: 'high' })
  fireEvent.click(screen.getByRole('button', { name: 'high' }))
  expect(apply).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Apply to session' }))
  expect(apply).toHaveBeenCalledWith('test/one high')
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'other' } })
  expect(screen.queryByRole('button', { name: /First model/ })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /Second model/ }))
  expect(screen.getByText('This model has no named variants.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Apply to session' }))
  expect(apply).toHaveBeenLastCalledWith('other/two')
})
it.each(['thinking', 'variants', 'effort', 'model-variant'])('uses the current model for /%s', async command => {
  render(<ModelPicker threadId="100000000000000001" command={command} arguments="high" close={() => {}} apply={() => {}} />)
  expect((await screen.findByRole('button', { name: 'high' })).getAttribute('aria-pressed')).toBe('true')
  expect(screen.queryByRole('searchbox')).toBeNull()
})
it('preserves cancellation and supports retry after discovery fails', async () => {
  const close = vi.fn(), apply = vi.fn()
  vi.mocked(chatRequest).mockRejectedValueOnce(new Error('Models unavailable'))
  render(<ModelPicker threadId="100000000000000001" command="models" arguments="" close={close} apply={apply} />)
  await screen.findByRole('alert')
  expect((screen.getByRole('button', { name: 'Apply to session' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(close).toHaveBeenCalledOnce(); expect(apply).not.toHaveBeenCalled()
})
