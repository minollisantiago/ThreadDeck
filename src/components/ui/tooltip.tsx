import * as React from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { cn } from '../../lib/utils'

const ProviderContext = React.createContext(false)

export function TooltipProvider({ children, delayDuration = 350, ...props }: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return <ProviderContext.Provider value={true}><TooltipPrimitive.Provider delayDuration={delayDuration} {...props}>{children}</TooltipPrimitive.Provider></ProviderContext.Provider>
}

export const Tooltip = TooltipPrimitive.Root
export const TooltipTrigger = TooltipPrimitive.Trigger

export function TooltipContent({ className, sideOffset = 6, container, children, hideArrow = false, ...props }: React.ComponentProps<typeof TooltipPrimitive.Content> & { container?: HTMLElement; hideArrow?: boolean }) {
  return <TooltipPrimitive.Portal container={container}><TooltipPrimitive.Content data-slot="tooltip-content" sideOffset={sideOffset} className={cn('app-tooltip', className)} {...props}>{children}{!hideArrow && <TooltipPrimitive.Arrow className="app-tooltip-arrow" />}</TooltipPrimitive.Content></TooltipPrimitive.Portal>
}

/** Keep the trigger's DOM/layout intact, including in native top-layer dialogs and popovers. */
export function TooltipHint({ label, children, onTriggerFocus, followCursor = false }: { label: React.ReactNode; children: React.ReactElement; onTriggerFocus?: React.FocusEventHandler<HTMLElement>; followCursor?: boolean }) {
  const provided = React.useContext(ProviderContext)
  const [container, setContainer] = React.useState<HTMLElement>()
  const [cursor, setCursor] = React.useState<{ side: 'left' | 'right'; offset: number; align: number; width: number } | null>(null)
  const trigger = React.useCallback((node: HTMLElement | null) => { setContainer(node?.closest<HTMLElement>('dialog,[popover]') ?? undefined) }, [])
  if (!label) return children
  const tooltip = <Tooltip disableHoverableContent={followCursor || undefined}><TooltipTrigger asChild ref={trigger} onFocus={event => { setCursor(null); onTriggerFocus?.(event) }} onPointerMove={followCursor ? event => {
    if (event.pointerType === 'touch') return
    const rect = event.currentTarget.getBoundingClientRect(), right = window.innerWidth - event.clientX
    // Offset Radix's row anchor to the pointer. Keep a 20px horizontal gap;
    // use the left side only when the viewport has no readable space on the right.
    const side = right >= 180 ? 'right' : 'left'
    setCursor({ side, offset: side === 'right' ? event.clientX - rect.right + 20 : rect.left - event.clientX + 20, align: event.clientY - rect.top + 12, width: Math.min(320, Math.max(140, (side === 'right' ? right : event.clientX) - 32)) })
  } : undefined}>{children}</TooltipTrigger><TooltipContent container={container} className={followCursor ? 'app-tooltip-cursor' : undefined} side={followCursor ? cursor?.side || 'top' : undefined} sideOffset={followCursor ? cursor?.offset ?? 12 : 6} align={followCursor && cursor ? 'start' : 'center'} alignOffset={cursor?.align || 0} hideArrow={followCursor} style={followCursor ? { pointerEvents: 'none', maxWidth: cursor?.width || 320 } : undefined}>{label}</TooltipContent></Tooltip>
  return provided ? tooltip : <TooltipProvider>{tooltip}</TooltipProvider>
}
