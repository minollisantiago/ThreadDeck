import { isActive, isAttention, type Project, type Session } from '../../shared/model'

export type Filter = 'all' | 'working' | 'attention' | 'recent'
export function visibleProjects(projects: Project[], query: string, filter: Filter, now: number, verified: boolean) {
  const search = query.trim().toLocaleLowerCase()
  return projects.map(project => ({ ...project, sessions: project.sessions.filter(session => {
    const matches = !search || `${project.name} ${session.title}`.toLocaleLowerCase().includes(search)
    if (!matches) return false
    if (filter === 'working') return verified && session.agentCount > 0
    if (filter === 'attention') return verified && isAttention(session.status)
    if (filter === 'recent') return session.updatedAt >= now - 24 * 60 * 60 * 1000
    return true
  }) })).filter(project => !search && filter === 'all' || project.sessions.length > 0)
}
export function projectOrder(projects: Project[], verified: boolean) {
  return [...projects].sort((a, b) => {
    const active = (p: Project) => verified && p.sessions.some(isActive) ? 1 : 0
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
