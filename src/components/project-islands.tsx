import { ChevronDown, CircleAlert, Radio } from 'lucide-react'
import { isAttention, type Project, type Session } from '../../shared/model'
import { sessionOrder, workingCount } from '../lib/view'
import { SessionRow } from './session-row'
import { Badge } from './ui/badge'
import { ProjectCollapse } from './project-collapse'

export function ProjectIslands({ projects, verified, now, unread, markRead, collapsed, toggle }: {
  projects: Project[]; verified: boolean; now: number
  unread: ReadonlySet<string>; markRead: (session: Session) => void
  collapsed: Record<string, boolean>; toggle: (key: string) => void
}) {
  return <div className="visual-projects projects-islands">
    {projects.map(project => {
      const key = project.id
      const closed = collapsed[key] ?? false
      const working = verified ? workingCount(project.sessions) : 0
      const attention = verified ? project.sessions.filter(session => isAttention(session.status)).length : 0
      const unreadCount = project.sessions.filter(session => unread.has(session.id)).length
      return <section key={project.id} className="visual-project" aria-labelledby={`visual-heading-${project.id}`}>
        <div className="island-header" data-connected={!closed && project.sessions.length > 0}>
        <button className="visual-project-heading" id={`visual-heading-${project.id}`} onClick={() => toggle(key)} aria-expanded={!closed} aria-controls={`visual-sessions-${project.id}`}>
          <span className="project-emblem" aria-hidden="true">{project.name.slice(0, 2).toLocaleUpperCase()}<span className={`emblem-signal ${working > 0 ? 'signal-working' : ''}`} /></span>
          <span className="visual-project-identity"><span className="project-name">{project.name}</span><span className="visual-project-total">{project.sessions.length} {project.sessions.length === 1 ? 'thread' : 'threads'}</span></span>
          <ChevronDown className={`visual-chevron ${closed ? 'is-closed' : ''}`} aria-hidden="true" />
        </button>
        <div className="visual-project-stats">
          {verified ? <><Badge className={`status ${working ? 'status-working' : 'status-idle'}`}><Radio aria-hidden="true" />{working} working</Badge>{attention > 0 && <Badge className="status status-input"><CircleAlert aria-hidden="true" />{attention} {attention === 1 ? 'needs' : 'need'} attention</Badge>}</> : <span>Status unavailable</span>}
          {unreadCount > 0 && <Badge className="status status-unread visual-unread">{unreadCount} unread</Badge>}
        </div>
        </div>
        <ProjectCollapse id={`visual-sessions-${project.id}`} collapsed={closed}>
          <div className="visual-session-grid">
            {sessionOrder(project.sessions, verified).map(session => <SessionRow key={session.id} session={session} graphical verified={verified} now={now} unread={unread.has(session.id)} markRead={markRead} />)}
            {project.sessions.length === 0 && <p className="project-empty">No recent Discord sessions.</p>}
          </div>
        </ProjectCollapse>
      </section>
    })}
  </div>
}
