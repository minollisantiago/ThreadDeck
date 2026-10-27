import { CheckCheck, Group } from 'lucide-react'
import { Button } from './ui/button'
import type { Grouping } from '../lib/view'
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from './ui/dropdown-menu'

export function ThreadOptions({ grouping, setGrouping, unreadCount, markAllRead }: {
  grouping: Grouping; setGrouping: (value: Grouping) => void; unreadCount: number; markAllRead: () => void
}) {
  return <div className="thread-list-actions">
    <Button variant="ghost" size="icon" aria-label="Mark all as read" disabled={unreadCount === 0} onClick={markAllRead} title={`Mark all ${unreadCount} unread responses as read`}><CheckCheck aria-hidden="true" /></Button>
    <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Group threads" title={`Group threads by ${grouping}`}><Group aria-hidden="true" /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end" aria-label="Group threads"><DropdownMenuRadioGroup value={grouping} onValueChange={value => { if (value === 'project' || value === 'state') setGrouping(value) }}>
        <DropdownMenuRadioItem value="project">By project</DropdownMenuRadioItem><DropdownMenuRadioItem value="state">By state</DropdownMenuRadioItem>
      </DropdownMenuRadioGroup></DropdownMenuContent>
    </DropdownMenu>
  </div>
}
