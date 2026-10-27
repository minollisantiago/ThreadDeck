import { CheckCheck, Group } from 'lucide-react'
import { Button } from './ui/button'
import type { Grouping } from '../lib/view'

export function ThreadOptions({ grouping, setGrouping, unreadCount, markAllRead }: {
  grouping: Grouping; setGrouping: (value: Grouping) => void; unreadCount: number; markAllRead: () => void
}) {
  return <div className="thread-list-actions">
    <Button variant="ghost" size="icon" aria-label="Mark all as read" disabled={unreadCount === 0} onClick={markAllRead} title={`Mark all ${unreadCount} unread responses as read`}><CheckCheck aria-hidden="true" /></Button>
    <label className="thread-group-select" title={`Group threads by ${grouping}`}><Group aria-hidden="true" /><select aria-label="Group threads" value={grouping} onChange={event => setGrouping(event.target.value === 'state' ? 'state' : 'project')}><option value="project">By project</option><option value="state">By state</option></select></label>
  </div>
}
