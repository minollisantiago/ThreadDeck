// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { SessionFinder } from './workspace'
import type { Project } from '../../shared/model'

const projects: Project[] = [
  { id: 'a', name: 'ThreadDeck', directory: '/threaddeck', sessions: [] },
  { id: 'b', name: 'Kimaki', directory: '/kimaki', sessions: [] },
  { id: 'c', name: 'Kitchen', directory: '/kitchen', sessions: [] },
]
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute('open', '') } })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute('open') } })
})
afterEach(() => { cleanup(); Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal'); Reflect.deleteProperty(HTMLDialogElement.prototype, 'close') })

function setup() {
  const create = vi.fn(), select = vi.fn()
  render(<SessionFinder projects={projects} sessions={[{ id: 's', projectId: 'a', title: 'Existing session', status: 'idle', updatedAt: 1, agentCount: 0, threadId: 't', guildId: null }]} create={create} select={select} close={vi.fn()} history={vi.fn()} />)
  return { create, select }
}

it('shows the new-thread shortcut and selects the first project on click', () => {
  const { create } = setup()
  const action = screen.getByRole('button', { name: /New thread \/ OpenCode session/ })
  expect(action.querySelector('kbd')?.textContent).toBe('Ctrl / ⌘ N')
  fireEvent.click(action)
  const input = screen.getByRole('textbox', { name: 'Find a project' })
  expect(document.activeElement).toBe(input)
  expect(screen.getByRole('button', { name: /ThreadDeck/ }).classList.contains('selected')).toBe(true)
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(create).toHaveBeenCalledExactlyOnceWith(projects[0])
})

it('navigates projects, resets selection on fuzzy filtering, and handles no results', () => {
  const { create } = setup()
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'n', ctrlKey: true })
  const input = screen.getByRole('textbox', { name: 'Find a project' })
  fireEvent.keyDown(input, { key: 'ArrowUp' })
  expect(screen.getByRole('button', { name: /ThreadDeck/ }).classList.contains('selected')).toBe(true)
  fireEvent.keyDown(input, { key: 'ArrowDown' })
  fireEvent.keyDown(input, { key: 'ArrowDown' })
  fireEvent.keyDown(input, { key: 'ArrowDown' })
  expect(screen.getByRole('button', { name: /Kitchen/ }).classList.contains('selected')).toBe(true)
  fireEvent.keyDown(input, { key: 'ArrowUp' })
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(create).toHaveBeenLastCalledWith(projects[1])
  fireEvent.change(input, { target: { value: 'tdk' } })
  expect(screen.getByRole('button', { name: /ThreadDeck/ }).classList.contains('selected')).toBe(true)
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(create).toHaveBeenLastCalledWith(projects[0])
  fireEvent.change(input, { target: { value: 'zzzzzz' } })
  fireEvent.keyDown(input, { key: 'ArrowDown' })
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(screen.getByText('No matching projects.')).toBeTruthy()
  expect(create).toHaveBeenCalledTimes(2)
})

it('supports the Meta shortcut from any dialog control and resets when returning to sessions', () => {
  const { select } = setup()
  fireEvent.keyDown(screen.getByRole('button', { name: 'Close session finder' }), { key: 'n', metaKey: true })
  const input = screen.getByRole('textbox', { name: 'Find a project' })
  fireEvent.keyDown(input, { key: 'ArrowDown' })
  fireEvent.mouseMove(screen.getByRole('button', { name: /Kitchen/ }))
  expect(screen.getByRole('button', { name: /Kitchen/ }).classList.contains('selected')).toBe(true)
  fireEvent.keyDown(input, { key: 'n', metaKey: true })
  fireEvent.keyDown(screen.getByRole('textbox', { name: 'Find a session' }), { key: 'Enter' })
  expect(select).toHaveBeenCalledOnce()
})
