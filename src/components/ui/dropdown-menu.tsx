import * as React from 'react'
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import { Check } from 'lucide-react'
import { cn } from '../../lib/utils'

// shadcn/ui's Radix dropdown composition, styled with ThreadDeck's theme tokens.
export const DropdownMenu = DropdownMenuPrimitive.Root
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger
export const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup

export function DropdownMenuContent({ className, sideOffset = 6, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return <DropdownMenuPrimitive.Portal><DropdownMenuPrimitive.Content data-slot="dropdown-menu-content" sideOffset={sideOffset} collisionPadding={12} className={cn('dropdown-menu-content', className)} {...props} /></DropdownMenuPrimitive.Portal>
}

export function DropdownMenuRadioItem({ className, children, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.RadioItem>) {
  return <DropdownMenuPrimitive.RadioItem data-slot="dropdown-menu-radio-item" className={cn('dropdown-menu-radio-item', className)} {...props}>
    <span className="dropdown-menu-indicator"><DropdownMenuPrimitive.ItemIndicator><Check size={14} /></DropdownMenuPrimitive.ItemIndicator></span>{children}
  </DropdownMenuPrimitive.RadioItem>
}
