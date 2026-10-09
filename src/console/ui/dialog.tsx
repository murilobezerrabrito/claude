import * as DialogPrimitive from '@radix-ui/react-dialog'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '../../lib/utils.ts'
import { Button } from './button.tsx'

/** Confirmação de uma ação que muda dados (apagar, fechar o mês): título, explicação e dois botões. */
export function ConfirmDialog(props: {
  trigger: ReactNode
  title: string
  description: ReactNode
  confirmLabel: string
  destructive?: boolean
  onConfirm: () => void
}) {
  return (
    <DialogPrimitive.Root>
      <DialogPrimitive.Trigger asChild>{props.trigger}</DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <DialogContent>
          <DialogPrimitive.Title className="font-serif text-lg font-semibold">{props.title}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="mt-2 text-sm text-muted-foreground">{props.description}</DialogPrimitive.Description>
          <div className="mt-5 flex justify-end gap-2">
            <DialogPrimitive.Close asChild>
              <Button variant="outline">Cancelar</Button>
            </DialogPrimitive.Close>
            <DialogPrimitive.Close asChild>
              <Button variant={props.destructive ? 'destructive' : 'default'} onClick={props.onConfirm}>
                {props.confirmLabel}
              </Button>
            </DialogPrimitive.Close>
          </div>
        </DialogContent>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function DialogContent({ className, ...props }: ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Content
      className={cn('fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-card p-6 shadow-lg', className)}
      {...props}
    />
  )
}
