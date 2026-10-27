// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import type { Project } from '../../shared/model'
import { usePinned } from './use-pinned'

afterEach(() => { cleanup(); localStorage.clear() })
const project: Project = { id: 'project', name: 'Project', directory: '/project', sessions: [{ id: 'session', projectId: 'project', threadId: 'thread', guildId: null, title: 'Idle thread', status: 'idle', agentCount: 0, updatedAt: 1 }] }
it('persists pins by project and thread and restores them after remount', () => {
  const first = renderHook(() => usePinned([project]))
  act(() => first.result.current.togglePin(project.sessions[0]))
  expect(first.result.current.pinned.has('session')).toBe(true)
  first.unmount()
  const next = renderHook(() => usePinned([{ ...project, sessions: [{ ...project.sessions[0], id: 'restored-session' }] }]))
  expect(next.result.current.pinned.has('restored-session')).toBe(true)
  act(() => next.result.current.togglePin({ ...project.sessions[0], id: 'restored-session' }))
  expect(next.result.current.pinned.size).toBe(0)
  expect(JSON.parse(localStorage.getItem('threaddeck:pinned-threads')!)).toEqual([])
})
it('syncs pin changes from another tab and tolerates malformed storage', () => {
  localStorage.setItem('threaddeck:pinned-threads', 'invalid')
  const hook = renderHook(() => usePinned([project]))
  expect(hook.result.current.pinned.size).toBe(0)
  act(() => {
    localStorage.setItem('threaddeck:pinned-threads', JSON.stringify(['project:thread']))
    window.dispatchEvent(new StorageEvent('storage', { key: 'threaddeck:pinned-threads' }))
  })
  expect(hook.result.current.pinned.has('session')).toBe(true)
})
