'use client'

import { useEffect } from 'react'

export function GlobalErrorLogger() {
  useEffect(() => {
    if (typeof window === 'undefined') return

    const origOnError = window.onerror
    window.onerror = (msg, source, line, col, err) => {
      const message = err?.message || String(msg)
      fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          level: 'error',
          message: message.slice(0, 500),
          details: { source, line, col, stack: err?.stack?.slice(0, 500) },
          source: 'app-crash',
        }),
      }).catch(() => {})
      origOnError?.call(window, msg, source, line, col, err)
    }

    const origOnRejection = window.onunhandledrejection
    window.onunhandledrejection = (event) => {
      const message = event.reason?.message || String(event.reason)
      fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          level: 'warn',
          message: `Unhandled promise rejection: ${message.slice(0, 500)}`,
          details: { stack: event.reason?.stack?.slice(0, 500) },
          source: 'app-crash',
        }),
      }).catch(() => {})
      origOnRejection?.call(window, event)
    }

    return () => {
      window.onerror = origOnError
      window.onunhandledrejection = origOnRejection
    }
  }, [])

  return null
}
