// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { PromptComposer } from './composer'
import type { Draft } from './drafts'
import { modelControls } from '../../shared/slash'

afterEach(() => { cleanup(); localStorage.clear() })
function Harness({ error, loading }: { error?: string; loading?: boolean }) {
  const [draft, setDraft] = useState<Draft>({ text: '/', anchor: 1, head: 1, files: [], revision: '' })
  return <PromptComposer draft={draft} change={patch => setDraft(previous => ({ ...previous, ...patch }))} expanded={false} toggle={() => {}} enabled busy={false} pending={false} catalog={{ entries: [...modelControls, { kind: 'skill', name: 'research', description: 'Investigate primary sources' }, { kind: 'command', name: 'docs:find', description: 'Documentation' }, ...Array.from({ length: 25 }, (_, index) => ({ kind: 'command' as const, name: `command${index}` }))] }} catalogError={error} catalogLoading={loading} retryCatalog={() => {}} submit={submitted} stop={() => {}} />
}
const submitted = vi.fn()
it('shows all entries, navigates with keyboard, inserts without executing and dismisses without blurring', () => {
  submitted.mockClear(); render(<Harness />)
  const input = screen.getByRole('textbox', { name: 'Write a prompt' })
  expect(screen.getAllByRole('option')).toHaveLength(33)
  input.focus()
  fireEvent.keyDown(input, { key: 'ArrowDown' })
  const selected = screen.getAllByRole('option').find(option => option.getAttribute('aria-selected') === 'true')!
  const syntax = selected.querySelector('strong')!.textContent
  fireEvent.keyDown(input, { key: 'Tab' })
  expect((input as HTMLTextAreaElement).value).toBe(`${syntax} `)
  expect(submitted).not.toHaveBeenCalled()
  expect(screen.queryByRole('listbox')).toBeNull()
  fireEvent.change(input, { target: { value: '/PRIMARY SOURCES' } })
  expect(screen.getAllByRole('option')).toHaveLength(1)
  fireEvent.keyDown(input, { key: 'Escape' })
  expect(screen.queryByRole('listbox')).toBeNull()
  expect(document.activeElement).toBe(input)
})
it('selects skills using Enter and distinguishes MCP prompts', () => {
  render(<Harness />)
  const input = screen.getByRole('textbox', { name: 'Write a prompt' })
  expect(screen.getByText('MCP prompt')).toBeTruthy()
  fireEvent.change(input, { target: { value: '/rsrch' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  expect((input as HTMLTextAreaElement).value).toBe('/research-skill ')
  expect(screen.getByText('Skills require Send now and cannot be queued.')).toBeTruthy()
})
it('shows loading, failure with retry, and no-match states', () => {
  const { rerender } = render(<Harness loading />)
  expect(screen.getByText('Loading project commands…')).toBeTruthy()
  rerender(<Harness error="Catalog unavailable" />)
  expect(screen.getByRole('alert').textContent).toContain('Catalog unavailable')
  expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
  rerender(<Harness />)
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '/missing-entry' } })
  expect(screen.getByText('No matching commands or skills.')).toBeTruthy()
})
