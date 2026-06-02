'use client'

import { createContext, useContext, useState, useCallback, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface ConfirmOptions {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'default' | 'destructive'
}

interface ConfirmState {
  open: boolean
  options: ConfirmOptions
  resolve: (value: boolean) => void
}

const ConfirmContext = createContext<((opts: ConfirmOptions) => Promise<boolean>) | null>(null)

export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used within <ConfirmProvider>')
  return ctx
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null)
  const resolveRef = useRef<((value: boolean) => void) | null>(null)

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      resolveRef.current = resolve
      setState({ open: true, options: opts, resolve })
    })
  }, [])

  const handleClose = useCallback((result: boolean) => {
    setState(null)
    resolveRef.current?.(result)
  }, [])

  return (
    <ConfirmContext value={confirm}>
      {children}
      {state && (
        <Dialog open={state.open} onOpenChange={(open) => { if (!open) handleClose(false) }}>
          <DialogContent showCloseButton={false}>
            <DialogHeader>
              <DialogTitle>{state.options.title}</DialogTitle>
              <DialogDescription>{state.options.message}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)}>
                {state.options.cancelLabel || 'Cancel'}
              </Button>
              <Button
                variant={state.options.variant === 'destructive' ? 'destructive' : 'default'}
                onClick={() => handleClose(true)}
              >
                {state.options.confirmLabel || (state.options.variant === 'destructive' ? 'Delete' : 'Confirm')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </ConfirmContext>
  )
}
