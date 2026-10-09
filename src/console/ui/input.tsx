import type { ComponentProps } from 'react'
import { cn } from '../../lib/utils.ts'

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-xs placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-medium',
        className,
      )}
      {...props}
    />
  )
}

/** Seleção nativa, com o visual do console (acessível pelo teclado e no celular). */
export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select className={cn('h-9 rounded-md border border-input bg-card px-3 text-sm', className)} {...props} />
}
