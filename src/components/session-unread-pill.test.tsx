// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { Session } from '../../shared/model'
import { SessionRow } from './session-row'

const now = 100_000
const session: Session = { id: 'finished', title: 'Finished session', projectId: 'project', threadId: 'thread', guildId: null, status: 'idle', agentCount: 0, updatedAt: now, responseAt: now }
afterEach(() => { cleanup(); vi.useRealTimers() })
const row = (s = session, time = now, unread = true, markRead = vi.fn(), verified = true) => <SessionRow session={s} now={time} unread={unread} markRead={markRead} verified={verified} />

it('shows just finished for 20 seconds, then unread without new snapshot data', () => {
  vi.useFakeTimers()
  render(row())
  expect(screen.getByText('Just finished')).toBeTruthy()
  act(() => vi.advanceTimersByTime(19_999))
  expect(screen.getByText('Just finished')).toBeTruthy()
  act(() => vi.advanceTimersByTime(1))
  expect(screen.getByText('Unread')).toBeTruthy()
})

it('uses response time on mount and does not restart the window on remount', () => {
  vi.useFakeTimers()
  const view = render(row(session, now + 15_000))
  expect(view.container.querySelector('.finished-runway')?.getAttribute('style')).toContain('-15000ms')
  act(() => vi.advanceTimersByTime(5_000))
  expect(screen.getByText('Unread')).toBeTruthy()
  view.unmount()
  render(row(session, now + 20_000))
  expect(screen.queryByText('Just finished')).toBeNull()
})

it('marks read immediately and never brings the pill back after its timer', () => {
  vi.useFakeTimers()
  const markRead = vi.fn()
  const view = render(row(session, now, true, markRead))
  fireEvent.click(screen.getByRole('button', { name: 'Mark Finished session as read' }))
  expect(markRead).toHaveBeenCalledWith(session)
  view.rerender(row(session, now, false, markRead))
  act(() => vi.advanceTimersByTime(20_000))
  expect(screen.queryByText('Unread')).toBeNull()
  expect(screen.queryByText('Just finished')).toBeNull()
})

it.each([
  { ...session, status: 'working' as const, agentCount: 1 },
  { ...session, status: 'error' as const },
  { ...session, status: 'input' as const },
  { ...session, status: 'permission' as const },
  { ...session, agentCount: 1 },
  { ...session, responseAt: null },
  { ...session, responseAt: now - 20_000 },
  { ...session, responseAt: now + 1 },
])('does not claim completion for ineligible session %j', value => {
  render(row(value))
  expect(screen.queryByText('Just finished')).toBeNull()
  expect(screen.getByText('Unread')).toBeTruthy()
})

it('clears fresh completion on resumed work and starts a new window for a new reply', () => {
  vi.useFakeTimers()
  const view = render(row())
  view.rerender(row({ ...session, status: 'working', agentCount: 1 }, now + 5_000))
  expect(screen.queryByText('Just finished')).toBeNull()
  expect(screen.getByText('Working')).toBeTruthy()
  view.rerender(row({ ...session, responseAt: now + 10_000 }, now + 10_000))
  expect(screen.getByText('Just finished')).toBeTruthy()
  act(() => vi.advanceTimersByTime(20_000))
  expect(screen.getByText('Unread')).toBeTruthy()
})

it('does not show a verified completion when disconnected', () => {
  render(row(session, now, true, vi.fn(), false))
  expect(screen.queryByText('Just finished')).toBeNull()
})
