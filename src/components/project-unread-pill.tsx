import { cn } from '../lib/utils'

export function ProjectUnreadPill({ count, projectName, describedBy, markRead, className }: {
  count: number; projectName: string; describedBy: string; markRead: () => void; className?: string
}) {
  if (count === 0) return null
  return <button type="button" className={cn('project-unread-action status-unread', className)} aria-label="Mark all threads as read" aria-describedby={describedBy} title={`Mark all unread threads in ${projectName} as read, including those hidden by filters. Read state is local to this browser.`} onClick={markRead}>{count} unread</button>
}
