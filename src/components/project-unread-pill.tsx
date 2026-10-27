import { cn } from '../lib/utils'
import { TooltipHint } from './ui/tooltip'

export function ProjectUnreadPill({ count, projectName, describedBy, markRead, className }: {
  count: number; projectName: string; describedBy: string; markRead: () => void; className?: string
}) {
  if (count === 0) return null
  return <TooltipHint label={`Mark all unread threads in ${projectName} as read, including those hidden by filters. Read state is local to this browser.`}><button type="button" className={cn('project-unread-action status-unread', className)} aria-label="Mark all threads as read" aria-describedby={describedBy} onClick={markRead}>{count} unread</button></TooltipHint>
}
