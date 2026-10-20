import type { Project } from '../../shared/model'

export type ReadResponses = Record<string, number>
export const readKey = (projectId: string, threadId: string) => `${projectId}:${threadId}`

export function unreadSessions(projects: Project[], read: ReadResponses) {
  return new Set(projects.flatMap(project => project.sessions.filter(session =>
    session.agentCount === 0 && session.responseAt != null
    && session.responseAt > (read[readKey(session.projectId, session.threadId)] ?? 0),
  ).map(session => session.id)))
}
