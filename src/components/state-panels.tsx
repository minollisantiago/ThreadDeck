import { SessionRow } from './session-row'
import type { Session } from '../../shared/model'
import type { stateGroups } from '../lib/view'

export function StatePanels({ groups, verified, now, unread, markRead, graphical }: {
  groups: ReturnType<typeof stateGroups>; verified: boolean; now: number
  unread: ReadonlySet<string>; markRead: (session: Session) => void; graphical: boolean
}) {
  return <>{groups.map(group => <section key={group.id} className={`project-panel state-panel state-panel-${group.id}`} aria-labelledby={`state-heading-${group.id}`}>
    <h2 className="state-heading" id={`state-heading-${group.id}`}><span>{group.label}</span>{' '}<span className="project-total">{group.threads.length} {group.threads.length === 1 ? 'thread' : 'threads'}</span></h2>
    <div className={`state-sessions ${graphical ? 'visual-session-grid' : ''}`}>
      {group.threads.map(({ session, project }) => <SessionRow key={session.id} session={session} projectName={project.name} verified={verified} now={now} unread={unread.has(session.id)} markRead={markRead} graphical={graphical} />)}
    </div>
  </section>)}</>
}
