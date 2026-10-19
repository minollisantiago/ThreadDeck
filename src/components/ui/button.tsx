import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  { variants: {
    variant: { default: 'bg-secondary text-foreground hover:bg-muted', ghost: 'hover:bg-secondary text-muted-foreground hover:text-foreground', outline: 'border border-border bg-transparent hover:bg-secondary' },
    size: { default: 'h-9 px-3', icon: 'size-9 p-2' },
  }, defaultVariants: { variant: 'default', size: 'default' } },
)

export function Button({ className, variant, size, asChild = false, ...props }:
  React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button'
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />
}
