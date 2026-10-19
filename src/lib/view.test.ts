import { expect, it } from 'vitest'
import type { Project } from '../../shared/model'
import { projectOrder, visibleProjects } from './view'

const projects: Project[] = [
  { id: 'one', name: 'Alpha', directory: '/alpha', sessions: [{ id: 'a', title: 'Fix layout', projectId: 'one', guildId: null, threadId: '1', status: 'working', updatedAt: 100, agentCount: 1 }] },
  { id: 'two', name: 'Beta', directory: '/beta', sessions: [{ id: 'b', title: 'Ask a question', projectId: 'two', guildId: null, threadId: '2', status: 'input', updatedAt: 10, agentCount: 0 }] },
]
it('preserves project grouping through every filter and search', () => {
  expect(visibleProjects(projects, '', 'working', 100, true).map(p => p.id)).toEqual(['one'])
  expect(visibleProjects(projects, '', 'attention', 100, true).map(p => p.id)).toEqual(['two'])
  expect(visibleProjects(projects, 'beta', 'all', 100, true)[0].sessions[0].id).toBe('b')
  expect(visibleProjects(projects, 'layout', 'all', 100, true)[0].name).toBe('Alpha')
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
