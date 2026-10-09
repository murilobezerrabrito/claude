import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { cn } from '../../lib/utils.ts'

const alertVariants = cva('rounded-md border px-4 py-3 text-sm', {
  variants: {
    tone: {
      info: 'border-border bg-muted text-foreground',
      error: 'border-destructive/40 bg-destructive-soft text-destructive',
      success: 'border-band-green/40 bg-band-green-soft text-band-green',
      warning: 'border-band-yellow/40 bg-band-yellow-soft text-band-yellow',
    },
  },
  defaultVariants: { tone: 'info' },
})

export function Alert({ className, tone, ...props }: ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return <div role={tone === 'error' ? 'alert' : 'status'} className={cn(alertVariants({ tone }), className)} {...props} />
}
