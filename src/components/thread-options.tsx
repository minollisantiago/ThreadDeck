import { CheckCheck, Group } from 'lucide-react'
import { useRef } from 'react'
import { Button } from './ui/button'
import { TooltipHint } from './ui/tooltip'
import type { Grouping } from '../lib/view'
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from './ui/dropdown-menu'

export function ThreadOptions({ grouping, setGrouping, unreadCount, markAllRead }: {
  grouping: Grouping; setGrouping: (value: Grouping) => void; unreadCount: number; markAllRead: () => void
}) {
  const restoringFocus = useRef(false)
  return <div className="thread-list-actions">
    <TooltipHint label={`Mark all ${unreadCount} unread responses as read`}><Button variant="ghost" size="icon" aria-label="Mark all as read" disabled={unreadCount === 0} onClick={markAllRead}><CheckCheck aria-hidden="true" /></Button></TooltipHint>
    <DropdownMenu><TooltipHint label={`Group threads by ${grouping}`} onTriggerFocus={event => { if (restoringFocus.current) event.preventDefault() }}><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Group threads"><Group aria-hidden="true" /></Button></DropdownMenuTrigger></TooltipHint>
      <DropdownMenuContent align="end" aria-label="Group threads" onCloseAutoFocus={() => {
        // Keep Radix's accessible focus restoration, but don't reopen its tooltip.
        restoringFocus.current = true
        queueMicrotask(() => { restoringFocus.current = false })
      }}><DropdownMenuRadioGroup value={grouping} onValueChange={value => { if (value === 'project' || value === 'state') setGrouping(value) }}>
        <DropdownMenuRadioItem value="project">By project</DropdownMenuRadioItem><DropdownMenuRadioItem value="state">By state</DropdownMenuRadioItem>
      </DropdownMenuRadioGroup></DropdownMenuContent>
    </DropdownMenu>
  </div>
}
