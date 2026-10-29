// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Dashboard } from './App'
import { designs } from './lib/design'
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

it('keeps Classic as default and remembers the selected design across mounts', () => {
  const { unmount, container } = render(<Dashboard snapshot={snapshot} now={now} />)
  expect(container.querySelector('.app-shell')?.getAttribute('data-design')).toBe('classic')
  expect(screen.getByRole('button', { name: 'Group threads' })).toBeTruthy()
  const toggle = screen.getByRole('button', { name: 'Switch to islands view' })
  expect(toggle.nextElementSibling?.getAttribute('aria-label')).toBe('Switch to light mode')
  fireEvent.click(toggle)
  expect(localStorage.getItem('threaddeck:design')).toBe('"islands"')
  unmount()
  const next = render(<Dashboard snapshot={snapshot} now={now} />)
  expect(next.container.querySelector('.projects-islands')).not.toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Switch to list view' }))
  expect(next.container.querySelector('.app-shell')?.getAttribute('data-design')).toBe('classic')
})

it.each(['future-design', 'cockpit', 'board'])('falls back to Classic for removed or invalid stored design %s', value => {
  localStorage.setItem('threaddeck:design', JSON.stringify(value))
  const { container } = render(<Dashboard snapshot={snapshot} now={now} />)
  expect(container.querySelector('.app-shell')?.getAttribute('data-design')).toBe('classic')
})

it('islands preserves filtering, unread actions, links and unknown states', () => {
  const { container, rerender } = render(<Dashboard snapshot={snapshot} now={now} />)
  fireEvent.click(screen.getByRole('button', { name: 'Switch to islands view' }))
  expect(container.querySelectorAll('.session-tile')).toHaveLength(3)
  expect(screen.getByRole('link', { name: 'Build the dashboard' }).getAttribute('href')).toMatch(/^discord:/)
  expect(screen.getByRole('link', { name: 'Open Review the design in browser' }).getAttribute('href')).toMatch(/^https:/)
  expect(screen.getByText('2 agents')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Mark Read the response as read' }))
  expect(screen.queryByText('Read the response')).toBeNull()
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Review' } })
  expect(screen.queryByText('Build the dashboard')).toBeNull()
  expect(screen.getByText('Permission needed')).toBeTruthy()
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } })
  rerender(<Dashboard snapshot={snapshot} transportError now={now} />)
  expect(container.querySelector('[data-state=working]')).toBeNull()
  expect(screen.getAllByText('Unknown')).toHaveLength(3)
  expect(screen.getByRole('img', { name: 'Working status unavailable in Alpha' })).toBeTruthy()
})

it('switches layouts without losing search or the original list collapse preference', () => {
  render(<Dashboard snapshot={snapshot} now={now} />)
  fireEvent.click(screen.getByRole('button', { name: /Alpha/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Switch to islands view' }))
  expect(screen.getByRole('link', { name: 'Build the dashboard' })).toBeTruthy()
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Review' } })
  fireEvent.click(screen.getByRole('button', { name: 'Switch to list view' }))
  expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('Review')
  expect(screen.getByRole('button', { name: /Alpha/ }).getAttribute('aria-expanded')).toBe('false')
})

it.each(designs)('$label retains empty-state recovery and project collapse', ({ value }) => {
  render(<Dashboard snapshot={snapshot} now={now} />)
  if (value === 'islands') fireEvent.click(screen.getByRole('button', { name: 'Switch to islands view' }))
  const heading = screen.getByRole('button', { name: /Alpha/ })
  fireEvent.click(heading)
  expect(heading.getAttribute('aria-expanded')).toBe('false')
  fireEvent.click(heading)
  expect(screen.getByRole('link', { name: 'Build the dashboard' })).toBeTruthy()
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'no matching thread' } })
  expect(screen.getByText('No matching sessions')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
  expect(screen.getByRole('link', { name: 'Build the dashboard' })).toBeTruthy()
})
