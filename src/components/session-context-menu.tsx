import { useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { CheckCheck, Pencil, Pin, PinOff } from 'lucide-react'

export function SessionContextMenu({ x, y, unread, markRead, close, pinned = false, togglePin, rename }: {
  x: number; y: number; unread: boolean; markRead: () => void; close: (restoreFocus?: boolean) => void; pinned?: boolean; togglePin?: () => void; rename?: () => void
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
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault()
        const items = [...panel.querySelectorAll<HTMLButtonElement>('button')], index = items.indexOf(document.activeElement as HTMLButtonElement)
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
        items[next]?.focus()
      }
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
    {togglePin && <button role="menuitem" onClick={() => { close(true); togglePin() }}>{pinned ? <PinOff aria-hidden="true" /> : <Pin aria-hidden="true" />}{pinned ? 'Unpin from Active' : 'Pin to Active'}</button>}
    {rename && <button role="menuitem" onClick={() => { close(); rename() }}><Pencil aria-hidden="true" />Rename…</button>}
  </div>, document.body)
}
