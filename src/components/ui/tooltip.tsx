import * as React from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { cn } from '../../lib/utils'

const ProviderContext = React.createContext(false)

export function TooltipProvider({ children, delayDuration = 350, ...props }: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return <ProviderContext.Provider value={true}><TooltipPrimitive.Provider delayDuration={delayDuration} {...props}>{children}</TooltipPrimitive.Provider></ProviderContext.Provider>
}

export const Tooltip = TooltipPrimitive.Root
export const TooltipTrigger = TooltipPrimitive.Trigger

export function TooltipContent({ className, sideOffset = 6, container, children, ...props }: React.ComponentProps<typeof TooltipPrimitive.Content> & { container?: HTMLElement }) {
  return <TooltipPrimitive.Portal container={container}><TooltipPrimitive.Content data-slot="tooltip-content" sideOffset={sideOffset} className={cn('app-tooltip', className)} {...props}>{children}<TooltipPrimitive.Arrow className="app-tooltip-arrow" /></TooltipPrimitive.Content></TooltipPrimitive.Portal>
}

/** Keep the trigger's DOM/layout intact, including in native top-layer dialogs and popovers. */
export function TooltipHint({ label, children, onTriggerFocus }: { label: React.ReactNode; children: React.ReactElement; onTriggerFocus?: React.FocusEventHandler<HTMLElement> }) {
  const provided = React.useContext(ProviderContext)
  const [container, setContainer] = React.useState<HTMLElement>()
  const trigger = React.useCallback((node: HTMLElement | null) => { setContainer(node?.closest<HTMLElement>('dialog,[popover]') ?? undefined) }, [])
  if (!label) return children
  const tooltip = <Tooltip><TooltipTrigger asChild ref={trigger} onFocus={onTriggerFocus}>{children}</TooltipTrigger><TooltipContent container={container}>{label}</TooltipContent></Tooltip>
  return provided ? tooltip : <TooltipProvider>{tooltip}</TooltipProvider>
}
