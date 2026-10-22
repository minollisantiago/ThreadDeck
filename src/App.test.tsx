// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
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
it.each(['classic', 'islands'] as const)('marks a project read from its header in %s view, including hidden threads but not other projects', design => {
  localStorage.setItem('threaddeck:design', JSON.stringify(design))
  const first = { ...snapshot.projects[0].sessions[0], id: 'alpha-first', threadId: '1561737719133114461', title: 'Visible response', status: 'idle' as const, agentCount: 0, responseAt: now }
  const second = { ...first, id: 'alpha-second', threadId: '1561737719133114462', title: 'Hidden response' }
  const mixed: Snapshot = { ...snapshot, projects: [
    { ...snapshot.projects[0], sessions: [snapshot.projects[0].sessions[0], first, second] },
    { ...snapshot.projects[1], sessions: [{ ...snapshot.projects[1].sessions[0], responseAt: now }] },
  ] }
  const view = render(<Dashboard snapshot={mixed} now={now} />)
  fireEvent.click(screen.getByRole('button', { name: /Alpha/ }))
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Visible response' } })
  fireEvent.click(screen.getByRole('button', { name: 'Mark all threads as read', description: /Alpha/ }))
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } })
  expect(screen.getByRole('button', { name: /Alpha/ }).getAttribute('aria-expanded')).toBe('false')
  expect(screen.queryByRole('button', { name: 'Mark all threads as read', description: /Alpha/ })).toBeNull()
  expect(screen.getByRole('button', { name: 'Mark all threads as read', description: /Beta/ })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'All sessions' }))
  expect(screen.queryByRole('button', { name: 'Mark Visible response as read', hidden: true })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Mark Hidden response as read', hidden: true })).toBeNull()
  view.unmount()
  const restored = render(<Dashboard snapshot={mixed} now={now} />)
  expect(screen.queryByRole('button', { name: 'Mark all threads as read', description: /Alpha/ })).toBeNull()
  expect(screen.getByRole('button', { name: 'Mark all threads as read', description: /Beta/ })).toBeTruthy()
  restored.rerender(<Dashboard snapshot={{ ...mixed, projects: [
    { ...mixed.projects[0], sessions: [mixed.projects[0].sessions[0], { ...first, responseAt: now + 1 }, second] }, mixed.projects[1],
  ] }} now={now} />)
  expect(screen.getByRole('button', { name: 'Mark all threads as read', description: /Alpha/ }).textContent).toBe('1 unread')
})
it('tracks the direction of filter changes without changing selection behavior', () => {
  render(<Dashboard snapshot={snapshot} now={now} />)
  const filters = screen.getByRole('group', { name: 'Filter sessions' })
  expect(filters.getAttribute('data-motion-direction')).toBe('none')
  fireEvent.click(screen.getByRole('button', { name: 'Working' }))
  expect(filters.getAttribute('data-motion-direction')).toBe('right')
  expect(screen.getByRole('button', { name: 'Working' }).getAttribute('aria-pressed')).toBe('true')
  fireEvent.click(screen.getByRole('button', { name: 'All sessions' }))
  expect(filters.getAttribute('data-motion-direction')).toBe('left')
})
it('distinguishes positive, zero and unavailable summary pill counts', () => {
  const { container, rerender } = render(<Dashboard snapshot={snapshot} now={now} />)
  expect(container.querySelector('.overview-pill-working')?.getAttribute('data-count-state')).toBe('positive')
  expect(container.querySelector('.overview-pill-attention')?.getAttribute('data-count-state')).toBe('zero')
  expect(container.querySelector('.overview-pill-projects')?.getAttribute('data-count-state')).toBe('positive')
  rerender(<Dashboard snapshot={snapshot} transportError now={now} />)
  expect(container.querySelectorAll('.overview-pill[data-count-state=unknown]')).toHaveLength(3)
  expect(container.querySelectorAll('.overview-pill[data-count-state=zero]')).toHaveLength(0)
})
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
  fireEvent.click(screen.getByRole('button', { name: 'All sessions' }))
  const idle: Snapshot = { ...snapshot, projects: snapshot.projects.map(p => ({ ...p, sessions: p.sessions.map(s => ({ ...s, status: 'idle', agentCount: 0 })) })) }
  rerender(<Dashboard snapshot={idle} now={now} />)
  expect(screen.getByRole('button', { name: /Alpha/ }).getAttribute('aria-expanded')).toBe('true')
})
it('keeps working sessions at the top of their project as live statuses change', () => {
  const working = snapshot.projects[0].sessions[0]
  const idle = { ...working, id: 'idle', title: 'Newer idle conversation', status: 'idle' as const, agentCount: 0, updatedAt: now + 1 }
  const mixed: Snapshot = { ...snapshot, projects: [{ ...snapshot.projects[0], sessions: [idle, working] }] }
  const { container, rerender } = render(<Dashboard snapshot={mixed} now={now} />)
  fireEvent.click(screen.getByRole('button', { name: 'All sessions' }))
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
  const indicator = container.querySelector('.connection')
  expect(indicator?.previousElementSibling?.querySelector('.header-actions')?.lastElementChild).toBe(screen.getByRole('link', { name: 'ThreadDeck on GitHub' }))
  expect(indicator?.parentElement?.lastElementChild).toBe(indicator)
  expect(screen.getByRole('status').classList.contains('sr-only')).toBe(true)
  expect(container.querySelector('.overview .connection')).toBeNull()
})
it('summarizes sessions and highlights only verified threads needing attention', () => {
  const base = snapshot.projects[0]
  const sessions = (['working', 'idle', 'input', 'permission', 'error'] as const).map((status, index) => ({
    ...base.sessions[0], id: `${index}`, title: `${status} thread`, status, agentCount: status === 'working' ? 1 : 0,
  }))
  const mixed: Snapshot = { ...snapshot, projects: [{ ...base, sessions }] }
  const { container, rerender } = render(<Dashboard snapshot={mixed} now={now} />)
  fireEvent.click(screen.getByRole('button', { name: 'All sessions' }))
  const header = screen.getByRole('button', { name: /Alpha/ })
  expect(header.textContent).toContain('5 sessions')
  expect(header.textContent).toContain('3 need attention')
  expect(container.querySelectorAll('.session-attention')).toHaveLength(3)
  expect(container.querySelectorAll('.session-attention-marker')).toHaveLength(3)
  expect(container.querySelector('.session-row .session-title')?.textContent).toBe('working thread')
  fireEvent.click(header)
  expect(header.textContent).toContain('3 need attention')
  expect(header.getAttribute('aria-expanded')).toBe('false')
  rerender(<Dashboard snapshot={mixed} transportError now={now} />)
  expect(container.querySelectorAll('.session-attention')).toHaveLength(0)
  expect(container.querySelector('.project-attention')).toBeNull()
})
it('labels single-session pills and does not flag idle projects as needing attention', () => {
  const { container } = render(<Dashboard snapshot={snapshot} now={now} />)
  fireEvent.click(screen.getByRole('button', { name: 'All sessions' }))
  expect(screen.getByRole('button', { name: /Beta/ }).textContent).toContain('1 session')
  expect(container.querySelector('.project-attention')).toBeNull()
})
it('hides idle sessions by default and reveals them only when all sessions is selected', () => {
  render(<Dashboard snapshot={snapshot} now={now} />)
  expect(screen.getByRole('button', { name: 'Active sessions' }).getAttribute('aria-pressed')).toBe('true')
  expect(screen.queryByRole('button', { name: /Beta/ })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'All sessions' }))
  fireEvent.click(screen.getByRole('button', { name: /Beta/ }))
  expect(screen.getByRole('link', { name: 'Old conversation' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Active sessions' }))
  expect(screen.queryByRole('link', { name: 'Old conversation' })).toBeNull()
})
it('offers a way to reveal idle sessions when none are active', () => {
  render(<Dashboard snapshot={{ ...snapshot, projects: [snapshot.projects[1]] }} now={now} />)
  expect(screen.getByText('No active sessions')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Show all sessions' }))
  expect(screen.getByRole('button', { name: /Beta/ })).toBeTruthy()
})
it('shows unread idle responses in the active view and persists marking them read', () => {
  const unread: Snapshot = { ...snapshot, projects: [{ ...snapshot.projects[1], sessions: [{ ...snapshot.projects[1].sessions[0], responseAt: now - 10 }] }] }
  const { container, unmount } = render(<Dashboard snapshot={unread} now={now} />)
  expect(screen.getByRole('button', { name: /Beta/ }).textContent).toContain('1 unread')
  expect(screen.getByRole('button', { name: /Beta/ }).getAttribute('aria-expanded')).toBe('true')
  expect(container.querySelectorAll('.session-unread')).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: 'Attention' }))
  expect(screen.getByRole('link', { name: 'Old conversation' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Mark Old conversation as read' }))
  expect(container.querySelector('.session-unread')).toBeNull()
  unmount()
  render(<Dashboard snapshot={unread} now={now} />)
  expect(screen.queryByRole('button', { name: /Beta/ })).toBeNull()
  expect(screen.getByText('No active sessions')).toBeTruthy()
})
it('marks a response read when opening its thread and flags the next completed response again', () => {
  const response = { ...snapshot.projects[1].sessions[0], responseAt: now - 10 }
  const unread: Snapshot = { ...snapshot, projects: [{ ...snapshot.projects[1], sessions: [response] }] }
  const { rerender, container } = render(<Dashboard snapshot={unread} now={now} />)
  const link = screen.getByRole('link', { name: 'Old conversation' })
  link.addEventListener('click', event => event.preventDefault())
  fireEvent.click(link)
  expect(container.querySelector('.session-unread')).toBeNull()
  rerender(<Dashboard snapshot={{ ...unread, projects: [{ ...unread.projects[0], sessions: [{ ...response, responseAt: now, updatedAt: now }] }] }} now={now} />)
  expect(container.querySelector('.session-unread')).not.toBeNull()
})
it('does not clear unread responses when merely expanding or collapsing their project', () => {
  const unread: Snapshot = { ...snapshot, projects: [{ ...snapshot.projects[1], sessions: [{ ...snapshot.projects[1].sessions[0], responseAt: now }] }] }
  render(<Dashboard snapshot={unread} now={now} />)
  fireEvent.click(screen.getByRole('button', { name: /Beta/ }))
  expect(screen.getByRole('button', { name: /Beta/ }).textContent).toContain('1 unread')
  fireEvent.click(screen.getByRole('button', { name: /Beta/ }))
  expect(screen.getByRole('button', { name: 'Mark Old conversation as read' })).toBeTruthy()
})
it('marks all unread responses read across projects and filters without acknowledging future replies', () => {
  const unread: Snapshot = { ...snapshot, projects: snapshot.projects.map(project => ({ ...project, sessions: project.sessions.map(session => ({ ...session, status: 'idle', agentCount: 0, responseAt: now - 10 })) })) }
  const { container, unmount } = render(<Dashboard snapshot={unread} now={now} />)
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'switchboard' } })
  expect(screen.queryByRole('button', { name: /Beta/ })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Mark all as read' }))
  expect(container.querySelector('.session-unread')).toBeNull()
  expect(screen.getByRole('button', { name: 'Mark all as read' }).hasAttribute('disabled')).toBe(true)
  unmount()
  const view = render(<Dashboard snapshot={unread} now={now} />)
  expect(screen.getByText('No active sessions')).toBeTruthy()
  view.rerender(<Dashboard snapshot={{ ...unread, projects: [{ ...unread.projects[1], sessions: [{ ...unread.projects[1].sessions[0], responseAt: now }] }] }} now={now} />)
  expect(screen.getByRole('button', { name: 'Mark Old conversation as read' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Mark all as read' }).hasAttribute('disabled')).toBe(false)
})
it('disables mark all as read when no responses are unread', () => {
  render(<Dashboard snapshot={snapshot} now={now} />)
  expect(screen.getByRole('button', { name: 'Mark all as read' }).hasAttribute('disabled')).toBe(true)
})
it.each(['list', 'islands', 'state'] as const)('marks only the right-clicked thread read in the %s view', view => {
  const unread: Snapshot = { ...snapshot, projects: snapshot.projects.map(project => ({ ...project, sessions: project.sessions.map(session => ({ ...session, status: 'idle', agentCount: 0, responseAt: now })) })) }
  const { unmount } = render(<Dashboard snapshot={unread} now={now} />)
  if (view === 'islands') fireEvent.click(screen.getByRole('button', { name: 'Switch to islands view' }))
  if (view === 'state') fireEvent.click(screen.getByRole('button', { name: 'By state' }))
  fireEvent.contextMenu(screen.getByRole('link', { name: 'Old conversation' }), { clientX: 100, clientY: 200 })
  const menu = screen.getByRole('menu', { name: 'Thread actions' })
  expect(screen.getByRole('button', { name: 'Mark Old conversation as read' })).toBeTruthy()
  const action = within(menu).getByRole('menuitem', { name: 'Mark as read' })
  expect(document.activeElement).toBe(action)
  fireEvent.click(action)
  expect(screen.queryByRole('menu')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Mark Old conversation as read' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Mark Build a switchboard as read' })).toBeTruthy()
  unmount()
  render(<Dashboard snapshot={unread} now={now} />)
  expect(screen.queryByRole('button', { name: 'Mark Old conversation as read' })).toBeNull()
})
it('dismisses a thread menu without marking it read and supports keyboard invocation', () => {
  const unread: Snapshot = { ...snapshot, projects: [{ ...snapshot.projects[0], sessions: [{ ...snapshot.projects[0].sessions[0], status: 'idle', agentCount: 0, responseAt: now }] }] }
  render(<Dashboard snapshot={unread} now={now} />)
  const row = screen.getByRole('link', { name: 'Build a switchboard' }).closest('.session-row')!
  fireEvent.keyDown(row, { key: 'F10', shiftKey: true })
  expect(screen.getByRole('menu')).toBeTruthy()
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
  expect(screen.queryByRole('menu')).toBeNull()
  expect(document.activeElement).toBe(row)
  fireEvent.contextMenu(row)
  fireEvent.pointerDown(document.body)
  expect(screen.queryByRole('menu')).toBeNull()
  expect(screen.getByRole('button', { name: 'Mark Build a switchboard as read' })).toBeTruthy()
})
it('disables the context action for threads already read', () => {
  render(<Dashboard snapshot={snapshot} now={now} />)
  fireEvent.contextMenu(screen.getByRole('link', { name: 'Build a switchboard' }))
  expect(screen.getByRole('menuitem', { name: 'Mark as read' }).getAttribute('aria-disabled')).toBe('true')
})
it('toggles state grouping, shows project pills, preserves filters and restores project collapse', () => {
  const mixed: Snapshot = { ...snapshot, projects: snapshot.projects.map(project => ({ ...project, sessions: project.sessions.map(session => ({ ...session, responseAt: session.id === 'b' ? now : undefined })) })) }
  render(<Dashboard snapshot={mixed} now={now} />)
  fireEvent.click(screen.getByRole('button', { name: /Alpha/ }))
  fireEvent.click(screen.getByRole('button', { name: 'By state' }))
  const attention = screen.getByRole('region', { name: 'Needs attention 1 thread' })
  expect(within(attention).getByText('Beta')).toBeTruthy()
  expect(within(attention).getByRole('link', { name: 'Old conversation' })).toBeTruthy()
  expect(screen.getByRole('region', { name: 'Working 1 thread' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Attention' }))
  expect(screen.queryByRole('region', { name: 'Working 1 thread' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Mark Old conversation as read' }))
  expect(screen.getByText('No matching sessions')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Active sessions' }))
  fireEvent.click(screen.getByRole('button', { name: 'By project' }))
  expect(screen.getByRole('button', { name: /Alpha/ }).getAttribute('aria-expanded')).toBe('false')
})
it('persists grouping independently of appearance and supports state tiles and project search', () => {
  const { unmount, container } = render(<Dashboard snapshot={snapshot} now={now} />)
  fireEvent.click(screen.getByRole('button', { name: 'By state' }))
  fireEvent.click(screen.getByRole('button', { name: 'Switch to islands view' }))
  expect(container.querySelector('.state-panel .session-tile')).not.toBeNull()
  unmount()
  render(<Dashboard snapshot={snapshot} now={now} />)
  expect(screen.getByRole('button', { name: 'By state' }).getAttribute('aria-pressed')).toBe('true')
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Alpha' } })
  expect(screen.getByRole('link', { name: 'Build a switchboard' })).toBeTruthy()
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Beta' } })
  expect(screen.getByText('No matching sessions')).toBeTruthy()
})
it('moves threads between state groups on refresh and treats stale status as unknown', () => {
  const { rerender } = render(<Dashboard snapshot={snapshot} now={now} />)
  fireEvent.click(screen.getByRole('button', { name: 'By state' }))
  const changed: Snapshot = { ...snapshot, projects: [{ ...snapshot.projects[0], sessions: [{ ...snapshot.projects[0].sessions[0], status: 'permission', agentCount: 0 }] }] }
  rerender(<Dashboard snapshot={changed} now={now} />)
  expect(screen.getByRole('region', { name: 'Needs attention 1 thread' })).toBeTruthy()
  expect(screen.queryByRole('region', { name: 'Working 1 thread' })).toBeNull()
  rerender(<Dashboard snapshot={changed} transportError now={now} />)
  expect(screen.queryByRole('region', { name: 'Needs attention 1 thread' })).toBeNull()
  expect(screen.getByRole('region', { name: 'Status unavailable 1 thread' })).toBeTruthy()
})
