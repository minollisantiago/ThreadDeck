import { useLayoutEffect, useState, type RefObject } from 'react'

// Anchor to the whole dock, not the smaller handle/cog hit area.
export function useDockPopover({ trigger, panel, align, width, focus }: {
  trigger: RefObject<HTMLButtonElement | null>; panel: RefObject<HTMLDivElement | null>
  align: 'left' | 'right'; width: number; focus?: RefObject<HTMLButtonElement | null>
}) {
  const [open, setOpen] = useState(false)
  useLayoutEffect(() => {
    const popup = panel.current, button = trigger.current
    if (!popup || !button) return
    const dock = button.closest('.user-panel') || button
    const position = () => {
      const rect = dock.getBoundingClientRect(), margin = 12, gap = 20
      const rail = Boolean(button.closest('.collapsed-sidebar'))
      const availableWidth = Math.min(width, window.innerWidth - margin * 2, rail ? width : rect.width)
      const above = rect.top - gap - margin, below = window.innerHeight - rect.bottom - gap - margin
      const left = rail ? rect.right + gap : align === 'left' ? rect.left : rect.right - availableWidth
      popup.style.width = `${availableWidth}px`
      popup.style.left = `${Math.max(margin, Math.min(left, window.innerWidth - availableWidth - margin))}px`
      popup.style.top = rail || above >= below ? 'auto' : `${rect.bottom + gap}px`
      popup.style.bottom = rail ? `${Math.max(margin, window.innerHeight - rect.bottom)}px` : above >= below ? `${window.innerHeight - rect.top + gap}px` : 'auto'
      popup.style.maxHeight = `${Math.max(0, rail ? rect.bottom - margin : Math.max(above, below))}px`
    }
    const beforeToggle = (event: ToggleEvent) => { if (event.newState === 'open') position() }
    const toggle = (event: ToggleEvent) => {
      setOpen(event.newState === 'open')
      if (event.newState === 'open') focus?.current?.focus({ preventScroll: true })
      else if (popup.contains(document.activeElement) || document.activeElement === document.body) button.focus({ preventScroll: true })
    }
    popup.addEventListener('beforetoggle', beforeToggle)
    popup.addEventListener('toggle', toggle)
    window.addEventListener('resize', position)
    window.addEventListener('scroll', position, true)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(position)
    observer?.observe(dock)
    position()
    return () => { popup.removeEventListener('beforetoggle', beforeToggle); popup.removeEventListener('toggle', toggle); window.removeEventListener('resize', position); window.removeEventListener('scroll', position, true); observer?.disconnect() }
  }, [trigger, panel, align, width, focus])
  return { open, close: () => { panel.current?.hidePopover(); trigger.current?.focus() } }
}
