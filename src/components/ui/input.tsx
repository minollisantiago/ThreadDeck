import type { ComponentProps } from 'react'
import { cn } from '../../lib/utils'

export function Input({ className, type, ...props }: ComponentProps<'input'>) {
  return <input data-slot="input" type={type} className={cn('h-10 w-full min-w-0 rounded-lg border border-border bg-card px-3 py-2 text-sm placeholder:text-muted-foreground', className)} {...props} />
}
