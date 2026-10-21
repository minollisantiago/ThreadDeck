import { useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { CheckCheck } from 'lucide-react'

export function SessionContextMenu({ x, y, unread, markRead, close }: {
  x: number; y: number; unread: boolean; markRead: () => void; close: (restoreFocus?: boolean) => void
}) {
  const menu = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const panel = menu.current
    if (!panel) return
    const rect = panel.getBoundingClientRect()
    panel.style.left = `${Math.max(8, Math.min(x, window.innerWidth - rect.width - 8))}px`
    panel.style.top = `${Math.max(8, Math.min(y, window.innerHeight - rect.height - 8))}px`
    panel.querySelector('button')?.focus()
    const dismissOutside = (event: Event) => { if (event.target instanceof Node && !panel.contains(event.target)) close() }
    const dismiss = () => close()
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true) }
      if (event.key === 'Tab') close()
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) event.preventDefault()
    }
    document.addEventListener('pointerdown', dismissOutside)
    document.addEventListener('contextmenu', dismissOutside)
    document.addEventListener('focusin', dismissOutside)
    document.addEventListener('keydown', keydown, true)
    window.addEventListener('resize', dismiss)
    window.addEventListener('scroll', dismiss, true)
    return () => {
      document.removeEventListener('pointerdown', dismissOutside)
      document.removeEventListener('contextmenu', dismissOutside)
      document.removeEventListener('focusin', dismissOutside)
      document.removeEventListener('keydown', keydown, true)
      window.removeEventListener('resize', dismiss)
      window.removeEventListener('scroll', dismiss, true)
    }
  }, [x, y, close])
  return createPortal(<div ref={menu} className="session-context-menu" role="menu" aria-label="Thread actions" style={{ left: x, top: y }} onContextMenu={event => { event.preventDefault(); event.stopPropagation() }}>
    <button role="menuitem" aria-disabled={!unread} onClick={() => { close(true); if (unread) markRead() }}><CheckCheck aria-hidden="true" />Mark as read</button>
  </div>, document.body)
}
