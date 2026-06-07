'use client'

import { createContext, useContext, useState, useCallback, useRef } from 'react'

export type ToastVariant = 'success' | 'error' | 'info' | 'warning'

export interface Toast {
  id: string
  message: string
  variant: ToastVariant
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>')
  return ctx
}

let toastId = 0

const VARIANT_STYLES: Record<ToastVariant, { icon: string; border: string; ring: string }> = {
  success: { icon: '✓', border: 'border-green-500', ring: 'ring-green-500/20' },
  error:   { icon: '✕', border: 'border-red-500', ring: 'ring-red-500/20' },
  warning: { icon: '⚠', border: 'border-yellow-500', ring: 'ring-yellow-500/20' },
  info:    { icon: 'i', border: 'border-blue-500', ring: 'ring-blue-500/20' },
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const timer = timersRef.current.get(id)
    if (timer) { clearTimeout(timer); timersRef.current.delete(id) }
  }, [])

  const toast = useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = `toast-${++toastId}`
    setToasts((prev) => [...prev, { id, message, variant }])
    const timer = setTimeout(() => removeToast(id), 5000)
    timersRef.current.set(id, timer)
  }, [removeToast])

  return (
    <ToastContext value={{ toast }}>
      {children}
      {toasts.length > 0 && (
        <div className="fixed top-14 right-4 z-[9999] flex flex-col gap-2 max-w-[260px] pointer-events-none">
          {toasts.map((t) => {
            const vs = VARIANT_STYLES[t.variant]
            return (
              <div
                key={t.id}
                role="alert"
                onClick={() => removeToast(t.id)}
                className={`animate-slide-in-right flex items-center gap-1.5 px-2.5 py-1.5 rounded-full shadow-lg text-[11px] font-medium cursor-pointer backdrop-blur-sm bg-white/90 border ${vs.border} ring-1 ${vs.ring} text-gray-800 transition-opacity duration-200`}
              >
                <span className="shrink-0 text-xs">{vs.icon}</span>
                {t.message}
              </div>
            )
          })}
        </div>
      )}
    </ToastContext>
  )
}
