import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { cn } from '../../lib/utils.ts'

const badgeVariants = cva('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap', {
  variants: {
    tone: {
      neutral: 'bg-muted text-muted-foreground',
      blue: 'bg-band-blue-soft text-band-blue',
      green: 'bg-band-green-soft text-band-green',
      yellow: 'bg-band-yellow-soft text-band-yellow',
      red: 'bg-band-red-soft text-band-red',
      primary: 'bg-primary text-primary-foreground',
    },
  },
  defaultVariants: { tone: 'neutral' },
})

export function Badge({ className, tone, ...props }: ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />
}
