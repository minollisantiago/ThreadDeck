import { isActive, isAttention, type Project, type Session } from '../../shared/model'

export type Filter = 'active' | 'all' | 'working' | 'attention' | 'recent'
export type Grouping = 'project' | 'state'
export const isGrouping = (value: unknown): value is Grouping => value === 'project' || value === 'state'

export function stateGroups(projects: Project[], verified: boolean, unread: ReadonlySet<string>) {
  const groups = [
    { id: 'attention', label: 'Needs attention' },
    { id: 'working', label: 'Working' },
    { id: 'idle', label: 'Idle' },
    { id: 'unknown', label: 'Status unavailable' },
  ].map(group => ({ ...group, threads: [] as { session: Session; project: Project }[] }))
  for (const project of projects) for (const session of project.sessions) {
    const state = unread.has(session.id) || verified && isAttention(session.status) ? 'attention'
      : !verified ? 'unknown' : session.agentCount > 0 || session.status === 'working' ? 'working' : 'idle'
    groups.find(group => group.id === state)!.threads.push({ session, project })
  }
  for (const group of groups) group.threads.sort((a, b) => b.session.updatedAt - a.session.updatedAt || a.session.id.localeCompare(b.session.id))
  return groups.filter(group => group.threads.length > 0)
}

export function visibleProjects(projects: Project[], query: string, filter: Filter, now: number, verified: boolean, unread: ReadonlySet<string> = new Set()) {
  const search = query.trim().toLocaleLowerCase()
  return projects.map(project => ({ ...project, sessions: project.sessions.filter(session => {
    const matches = !search || `${project.name} ${session.title}`.toLocaleLowerCase().includes(search)
    if (!matches) return false
    if (filter === 'active') return !verified || isActive(session) || unread.has(session.id)
    if (filter === 'working') return verified && session.agentCount > 0
    if (filter === 'attention') return unread.has(session.id) || verified && isAttention(session.status)
    if (filter === 'recent') return session.updatedAt >= now - 24 * 60 * 60 * 1000
    return true
  }) })).filter(project => !search && filter === 'all' || project.sessions.length > 0)
}
export function projectOrder(projects: Project[], verified: boolean, unread: ReadonlySet<string> = new Set()) {
  return [...projects].sort((a, b) => {
    const active = (p: Project) => p.sessions.some(s => unread.has(s.id) || verified && isActive(s)) ? 1 : 0
    return active(b) - active(a) || a.name.localeCompare(b.name)
  })
}
export function sessionOrder(sessions: Session[], verified: boolean) {
  return [...sessions].sort((a, b) => Number(verified && b.agentCount > 0) - Number(verified && a.agentCount > 0))
}
export function relativeTime(timestamp: number, now: number) {
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000))
  if (seconds < 5) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}
export const workingCount = (sessions: Session[]) => sessions.filter(s => s.agentCount > 0).length
