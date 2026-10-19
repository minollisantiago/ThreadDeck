// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Dashboard } from './App'
import type { Snapshot } from '../shared/model'

afterEach(() => { cleanup(); localStorage.clear() })
const now = 100_000
const snapshot: Snapshot = {
  health: 'connected', checkedAt: now, lastSuccessAt: now,
  attentionAvailable: true, inventoryLimited: false, message: null,
  projects: [
    { id: 'alpha', name: 'Alpha', directory: '/alpha', sessions: [
      { id: 'a', projectId: 'alpha', title: 'Build a switchboard', threadId: '1561737719133114458', guildId: '1526236793048141935', status: 'working', agentCount: 1, updatedAt: now },
    ] },
    { id: 'beta', name: 'Beta', directory: '/beta', sessions: [
      { id: 'b', projectId: 'beta', title: 'Old conversation', threadId: '1561737719133114459', guildId: '1526236793048141935', status: 'idle', agentCount: 0, updatedAt: 50 },
    ] },
  ],
}
it('focuses search when slash is pressed outside an editable field', () => {
  render(<Dashboard snapshot={snapshot} now={now} />)
  fireEvent.keyDown(document.body, { key: '/', code: 'Slash' })
  expect(document.activeElement).toBe(screen.getByRole('searchbox'))
})
it('handles the search shortcut before other page keyboard handlers can swallow it', () => {
  render(<Dashboard snapshot={snapshot} now={now} />)
  const stop = (event: KeyboardEvent) => event.stopPropagation()
  document.body.addEventListener('keydown', stop)
  try {
    fireEvent.keyDown(document.body, { key: '/', code: 'Slash' })
    expect(document.activeElement).toBe(screen.getByRole('searchbox'))
  } finally { document.body.removeEventListener('keydown', stop) }
})
it('does not steal slash from editable fields or modified browser shortcuts', () => {
  render(<Dashboard snapshot={snapshot} now={now} />)
  const input = screen.getByRole('searchbox')
  input.focus()
  const event = new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true })
  input.dispatchEvent(event)
  expect(event.defaultPrevented).toBe(false)
  input.blur()
  fireEvent.keyDown(document.body, { key: '/', ctrlKey: true })
  expect(document.activeElement).not.toBe(input)
})
it('places the GitHub icon link beside the theme control instead of on the branding', () => {
  render(<Dashboard snapshot={snapshot} now={now} />)
  const link = screen.getByRole('link', { name: 'ThreadDeck on GitHub' })
  expect(link.getAttribute('href')).toBe('https://github.com/minollisantiago/ThreadDeck')
  expect(link.getAttribute('target')).toBe('_blank')
  expect(link.getAttribute('rel')).toContain('noopener')
  expect(link.closest('.appearance-controls')).not.toBeNull()
  expect(link.previousElementSibling?.getAttribute('aria-label')).toBe('Switch to light mode')
  expect(screen.getByRole('heading', { name: /ThreadDeck/ }).closest('a')).toBeNull()
})
it('uses app-first title links and a separate browser fallback', () => {
  render(<Dashboard snapshot={snapshot} now={now} />)
  expect(screen.getByRole('link', { name: 'Build a switchboard' }).getAttribute('href')).toBe('discord://-/channels/1526236793048141935/1561737719133114458')
  expect(screen.getByRole('link', { name: 'Open Build a switchboard in browser' }).getAttribute('href')).toMatch(/^https:\/\/discord.com/)
})
it('preserves manual collapse and search while snapshots refresh', () => {
  const { rerender } = render(<Dashboard snapshot={snapshot} now={now} />)
  fireEvent.click(screen.getByRole('button', { name: /Alpha/ }))
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'switchboard' } })
  rerender(<Dashboard snapshot={{ ...snapshot, checkedAt: now + 1000 }} now={now + 1000} />)
  expect(screen.getByRole('button', { name: /Alpha/ }).getAttribute('aria-expanded')).toBe('false')
  expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('switchboard')
})
it('does not collapse an expanded project when its agent becomes idle', () => {
  const { rerender } = render(<Dashboard snapshot={snapshot} now={now} />)
  const idle: Snapshot = { ...snapshot, projects: snapshot.projects.map(p => ({ ...p, sessions: p.sessions.map(s => ({ ...s, status: 'idle', agentCount: 0 })) })) }
  rerender(<Dashboard snapshot={idle} now={now} />)
  expect(screen.getByRole('button', { name: /Alpha/ }).getAttribute('aria-expanded')).toBe('true')
})
it('keeps working sessions at the top of their project as live statuses change', () => {
  const working = snapshot.projects[0].sessions[0]
  const idle = { ...working, id: 'idle', title: 'Newer idle conversation', status: 'idle' as const, agentCount: 0, updatedAt: now + 1 }
  const mixed: Snapshot = { ...snapshot, projects: [{ ...snapshot.projects[0], sessions: [idle, working] }] }
  const { container, rerender } = render(<Dashboard snapshot={mixed} now={now} />)
  const titles = () => [...container.querySelectorAll('.session-title')].map(node => node.textContent)
  expect(titles()).toEqual(['Build a switchboard', 'Newer idle conversation'])
  rerender(<Dashboard snapshot={{ ...mixed, projects: [{ ...mixed.projects[0], sessions: [
    { ...idle, status: 'working', agentCount: 1 },
    { ...working, status: 'idle', agentCount: 0 },
  ] }] }} now={now} />)
  expect(titles()).toEqual(['Newer idle conversation', 'Build a switchboard'])
})
it('shows unknown states and no verified counts after connection loss', () => {
  const { rerender } = render(<Dashboard snapshot={snapshot} now={now} />)
  rerender(<Dashboard snapshot={snapshot} transportError now={now} />)
  expect(screen.getByRole('alert').textContent).toContain('Live status unavailable')
  expect(screen.getAllByText('Unknown').length).toBeGreaterThan(0)
  expect(screen.queryByText('1 working')).toBeNull()
})
it('searches within project groups and supports the working filter', () => {
  render(<Dashboard snapshot={snapshot} now={now} />)
  fireEvent.click(screen.getByRole('button', { name: 'Working' }))
  expect(screen.queryByRole('button', { name: /Beta/ })).toBeNull()
  expect(screen.getByRole('button', { name: /Alpha/ })).toBeTruthy()
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'no match' } })
  expect(screen.getByText('No matching sessions')).toBeTruthy()
})
it('marks aged successful snapshots stale even if the backend stops polling', () => {
  render(<Dashboard snapshot={snapshot} now={now + 21_000} />)
  expect(screen.getByRole('status').textContent).toContain('Connection stale')
})
it('moves update details into the connection tooltip', () => {
  const details: Snapshot = { ...snapshot, message: 'Source connected', attentionAvailable: false, inventoryLimited: true }
  const { container } = render(<Dashboard snapshot={details} now={now} />)
  expect(screen.getByRole('status').textContent).toBe('Connected')
  expect(container.querySelector('.refresh-age')).toBeNull()
  const tooltip = screen.getByRole('tooltip', { hidden: true })
  expect(tooltip.textContent).toContain(`Last successful update: ${new Date(now).toLocaleString()}`)
  expect(tooltip.textContent).toContain('Source connected')
  expect(tooltip.textContent).toContain('Attention status unavailable')
  expect(tooltip.textContent).toContain('Recent session inventory is limited')
  expect(screen.getByRole('button', { name: 'Connected' }).getAttribute('aria-describedby')).toBe(tooltip.id)
})
