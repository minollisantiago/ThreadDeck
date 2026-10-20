import { expect, it } from 'vitest'
import type { Project } from '../../shared/model'
import { projectOrder, sessionOrder, visibleProjects } from './view'

const projects: Project[] = [
  { id: 'one', name: 'Alpha', directory: '/alpha', sessions: [{ id: 'a', title: 'Fix layout', projectId: 'one', guildId: null, threadId: '1', status: 'working', updatedAt: 100, agentCount: 1 }] },
  { id: 'two', name: 'Beta', directory: '/beta', sessions: [{ id: 'b', title: 'Ask a question', projectId: 'two', guildId: null, threadId: '2', status: 'input', updatedAt: 10, agentCount: 0 }] },
]
it('preserves project grouping through every filter and search', () => {
  expect(visibleProjects(projects, '', 'active', 100, true).map(p => p.id)).toEqual(['one', 'two'])
  expect(visibleProjects(projects, '', 'working', 100, true).map(p => p.id)).toEqual(['one'])
  expect(visibleProjects(projects, '', 'attention', 100, true).map(p => p.id)).toEqual(['two'])
  expect(visibleProjects(projects, 'beta', 'all', 100, true)[0].sessions[0].id).toBe('b')
  expect(visibleProjects(projects, 'layout', 'all', 100, true)[0].name).toBe('Alpha')
})
it('hides idle sessions in the active view but preserves attention and working sessions', () => {
  const idle = { ...projects[0].sessions[0], id: 'idle', title: 'Idle session', status: 'idle' as const, agentCount: 0 }
  const mixed = [{ ...projects[0], sessions: [idle, ...projects[0].sessions, ...projects[1].sessions] }]
  expect(visibleProjects(mixed, '', 'active', 100, true)[0].sessions.map(s => s.id)).toEqual(['a', 'b'])
  expect(visibleProjects(mixed, '', 'all', 100, true)[0].sessions).toHaveLength(3)
  expect(visibleProjects(mixed, '', 'active', 100, false)[0].sessions).toHaveLength(3)
  expect(visibleProjects(mixed, 'idle', 'active', 100, true)).toHaveLength(0)
})
it('does not claim working or attention matches when the source is stale', () => {
  expect(visibleProjects(projects, '', 'working', 100, false)).toHaveLength(0)
  expect(visibleProjects(projects, '', 'attention', 100, false)).toHaveLength(0)
})
it('limits Recent activity to the last 24 hours', () => {
  expect(visibleProjects(projects, '', 'recent', 86_400_050, true).map(p => p.id)).toEqual(['one'])
})
it('orders active projects first without mutating the source', () => {
  const idle = { ...projects[0], sessions: projects[0].sessions.map(s => ({ ...s, agentCount: 0, status: 'idle' as const })) }
  expect(projectOrder([idle, projects[1]], true).map(p => p.id)).toEqual(['two', 'one'])
  expect(projects[0].name).toBe('Alpha')
})
it('puts working sessions first while preserving the order within each group', () => {
  const idle = { ...projects[0].sessions[0], id: 'idle', status: 'idle' as const, agentCount: 0 }
  const working = projects[0].sessions[0]
  const attention = projects[1].sessions[0]
  const sessions = [idle, working, attention, { ...working, id: 'other-working', agentCount: 2 }]
  expect(sessionOrder(sessions, true).map(s => s.id)).toEqual(['a', 'other-working', 'idle', 'b'])
  expect(sessions.map(s => s.id)).toEqual(['idle', 'a', 'b', 'other-working'])
  expect(sessionOrder(sessions, false)).toEqual(sessions)
})
