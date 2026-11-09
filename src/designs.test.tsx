// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Dashboard } from './App'
import type { Snapshot } from '../shared/model'

afterEach(() => { cleanup(); localStorage.clear() })
const now = 100_000
const snapshot: Snapshot = {
  health: 'connected', checkedAt: now, lastSuccessAt: now, attentionAvailable: true, inventoryLimited: false, message: null,
  projects: [{ id: 'alpha', name: 'Alpha', directory: '/alpha', sessions: [
    { id: 'working', projectId: 'alpha', title: 'Build the dashboard', threadId: '1561737719133114458', guildId: '1526236793048141935', status: 'working', agentCount: 2, updatedAt: now },
    { id: 'input', projectId: 'alpha', title: 'Review the design', threadId: '1561737719133114459', guildId: '1526236793048141935', status: 'permission', agentCount: 0, updatedAt: now },
    { id: 'reply', projectId: 'alpha', title: 'Read the response', threadId: '1561737719133114460', guildId: '1526236793048141935', status: 'idle', agentCount: 0, updatedAt: now, responseAt: now },
  ] }],
}

it.each(['islands', 'future-design', 'cockpit', 'board'])('always renders the current view despite legacy stored design %s', value => {
  localStorage.setItem('threaddeck:design', JSON.stringify(value))
  const { container } = render(<Dashboard snapshot={snapshot} now={now} />)
  expect(container.querySelector('.app-shell')?.getAttribute('data-design')).toBe('classic')
  expect(container.querySelector('.projects-islands')).toBeNull()
  expect(screen.queryByRole('button', { name: /Switch to (islands|list) view/ })).toBeNull()
  expect(screen.getByRole('button', { name: 'Group threads' })).toBeTruthy()
})

it('preserves filtering, unread actions, links and unknown states in the fixed view', () => {
  const { container, rerender } = render(<Dashboard snapshot={snapshot} now={now} />)
  expect(container.querySelectorAll('.session-row')).toHaveLength(3)
  expect(screen.getByRole('link', { name: 'Open Review the design in Discord' }).getAttribute('href')).toMatch(/^https:/)
  fireEvent.click(screen.getByRole('button', { name: 'Mark Read the response as read' }))
  expect(screen.queryByText('Read the response')).toBeNull()
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Review' } })
  expect(screen.queryByText('Build the dashboard')).toBeNull()
  expect(screen.getByText('Permission needed')).toBeTruthy()
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } })
  rerender(<Dashboard snapshot={snapshot} transportError now={now} />)
  expect(screen.getAllByText('Unknown')).toHaveLength(3)
  expect(screen.getByRole('img', { name: 'Working status unavailable in Alpha' })).toBeTruthy()
})

it('retains empty-state recovery and project collapse', () => {
  render(<Dashboard snapshot={snapshot} now={now} />)
  const heading = screen.getByRole('button', { name: /Alpha/ })
  fireEvent.click(heading)
  expect(heading.getAttribute('aria-expanded')).toBe('false')
  fireEvent.click(heading)
  expect(screen.getByText('Build the dashboard')).toBeTruthy()
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'no matching thread' } })
  expect(screen.getByText('No matching sessions')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
  expect(screen.getByText('Build the dashboard')).toBeTruthy()
})
