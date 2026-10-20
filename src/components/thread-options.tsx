import { useLayoutEffect, useRef, useState } from 'react'
import { CheckCheck, Settings2 } from 'lucide-react'
import { Button } from './ui/button'
import type { Grouping } from '../lib/view'

export function ThreadOptions({ grouping, setGrouping, unreadCount, markAllRead }: {
  grouping: Grouping; setGrouping: (value: Grouping) => void; unreadCount: number; markAllRead: () => void
}) {
  const trigger = useRef<HTMLButtonElement>(null)
  const controls = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  useLayoutEffect(() => {
    const media = window.matchMedia?.('(max-width: 600px)')
    const panel = controls.current
    if (!media || !panel) return
    const position = () => {
      const button = trigger.current
      if (!button || !media.matches) return
      const rect = button.getBoundingClientRect()
      const width = panel.offsetWidth || 260
      const height = panel.offsetHeight
      panel.style.left = `${Math.max(16, Math.min(rect.right - width, window.innerWidth - width - 16))}px`
      const below = rect.bottom + 8
      const top = below + height <= window.innerHeight - 16 ? below : Math.max(16, rect.top - height - 8)
      panel.style.top = `${top}px`
    }
    const sync = () => {
      const focused = panel.contains(document.activeElement)
      if (panel.matches(':popover-open')) panel.hidePopover()
      setOpen(false)
      if (media.matches) {
        panel.setAttribute('popover', 'auto')
        if (focused) trigger.current?.focus()
      } else {
        panel.removeAttribute('popover')
        panel.style.removeProperty('left'); panel.style.removeProperty('top')
        if (focused || document.activeElement === trigger.current) panel.querySelector('button')?.focus()
      }
    }
    const beforeToggle = (event: ToggleEvent) => { if (event.newState === 'open') position() }
    const toggle = (event: ToggleEvent) => {
      setOpen(event.newState === 'open')
      if (event.newState === 'open') position()
    }
    const reposition = () => { if (panel.matches(':popover-open')) position() }
    panel.addEventListener('beforetoggle', beforeToggle)
    panel.addEventListener('toggle', toggle)
    media.addEventListener('change', sync)
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    sync()
    return () => {
      panel.removeEventListener('beforetoggle', beforeToggle); panel.removeEventListener('toggle', toggle)
      media.removeEventListener('change', sync)
      window.removeEventListener('resize', reposition); window.removeEventListener('scroll', reposition, true)
    }
  }, [])
  return <>
    <Button ref={trigger} variant="outline" size="icon" className="thread-options-toggle" popoverTarget="thread-list-options" aria-label="Thread list options" aria-controls="thread-list-options" aria-expanded={open} title={`Thread list options · grouped by ${grouping}`}><Settings2 aria-hidden="true" /></Button>
    <div ref={controls} className="thread-list-options" id="thread-list-options" role="group" aria-label="Thread list options">
      <p className="thread-options-heading">Group threads</p>
      <div className="filter-group grouping-control" role="group" aria-label="Group threads">{([
        ['project', 'By project'], ['state', 'By state'],
      ] as const).map(([value, label]) => <Button key={value} variant="ghost" className={grouping === value ? 'filter-selected' : ''} aria-pressed={grouping === value} onClick={() => setGrouping(value)}>{label}</Button>)}</div>
      <Button variant="outline" className="mark-all-read" disabled={unreadCount === 0} onClick={markAllRead} title={`Mark all ${unreadCount} unread responses across loaded projects as read in this browser, including sessions hidden by filters`}><CheckCheck aria-hidden="true" />Mark all as read</Button>
    </div>
  </>
}
