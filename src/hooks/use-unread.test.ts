// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import type { Project } from '../../shared/model'
import { useUnread } from './use-unread'

afterEach(() => { cleanup(); localStorage.clear() })
const projects: Project[] = [{ id: 'project', name: 'Example', directory: '/example', sessions: [
  { id: 'session', projectId: 'project', threadId: 'thread', guildId: null, title: 'Response', status: 'idle', agentCount: 0, updatedAt: 100, responseAt: 90 },
] }]
const session = projects[0].sessions[0]

it('restores unread after reading, synchronizes hook consumers and persists across remounts', () => {
  const manager = renderHook(() => useUnread(projects)), pane = renderHook(() => useUnread(projects))
  act(() => pane.result.current.markRead(session))
  expect(manager.result.current.unread.size).toBe(0)
  act(() => manager.result.current.markUnread(session))
  expect(pane.result.current.unread.has(session.id)).toBe(true)
  manager.unmount(); pane.unmount()
  const restored = renderHook(() => useUnread(projects))
  expect(restored.result.current.unread.has(session.id)).toBe(true)
  act(() => restored.result.current.markRead(session))
  expect(restored.result.current.unread.size).toBe(0)
})

it.each(['thread', 'project', 'all'] as const)('clears manual unread without response data via the %s read action', action => {
  const thread = { ...session, responseAt: null }
  const view = renderHook(() => useUnread([{ ...projects[0], sessions: [thread] }]))
  act(() => view.result.current.markUnread(thread))
  expect(view.result.current.unread.has(thread.id)).toBe(true)
  act(() => {
    if (action === 'thread') view.result.current.markRead(thread)
    else if (action === 'project') view.result.current.markProjectRead(thread.projectId)
    else view.result.current.markAllRead()
  })
  expect(view.result.current.unread.size).toBe(0)
})

it('clears only the selected project and still flags future completions', () => {
  const other = { ...session, id: 'other', projectId: 'other' }
  const initial = [...projects, { ...projects[0], id: 'other', sessions: [other] }]
  const view = renderHook(({ data }) => useUnread(data), { initialProps: { data: initial } })
  act(() => view.result.current.markAllRead())
  act(() => view.result.current.markUnread(session))
  act(() => view.result.current.markUnread(other))
  act(() => view.result.current.markProjectRead(session.projectId))
  expect([...view.result.current.unread]).toEqual(['other'])
  view.rerender({ data: [{ ...projects[0], sessions: [{ ...session, responseAt: 110 }] }, initial[1]] })
  expect(view.result.current.unread.has(session.id)).toBe(true)
})
