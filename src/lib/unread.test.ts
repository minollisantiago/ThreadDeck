import { expect, it } from 'vitest'
import type { Project } from '../../shared/model'
import { readKey, unreadSessions } from './unread'

const project: Project = { id: 'project', name: 'Example', directory: '/example', sessions: [
  { id: 'session', projectId: 'project', threadId: 'thread', guildId: null, title: 'Response', status: 'idle', agentCount: 0, updatedAt: 100, responseAt: 90 },
] }

it('marks existing completed responses unread until their specific completion is acknowledged', () => {
  expect([...unreadSessions([project], {})]).toEqual(['session'])
  expect(unreadSessions([project], { [readKey('project', 'thread')]: 90 }).size).toBe(0)
  expect([...unreadSessions([project], { [readKey('project', 'thread')]: 80 })]).toEqual(['session'])
})
it('does not infer responses from title updates, missing completion data or working agents', () => {
  for (const changes of [{ responseAt: null }, { responseAt: undefined }, { agentCount: 1 }]) {
    expect(unreadSessions([{ ...project, sessions: [{ ...project.sessions[0], ...changes }] }], {}).size).toBe(0)
  }
  const renamed = { ...project, sessions: [{ ...project.sessions[0], title: 'Renamed', updatedAt: 200 }] }
  expect(unreadSessions([renamed], { [readKey('project', 'thread')]: 90 }).size).toBe(0)
})
