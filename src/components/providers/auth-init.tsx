'use client'

import { useEffect } from 'react'
import { useAuthStore } from '@/stores/auth-store'

export function AuthInit({ children }: { children: React.ReactNode }) {
  const checkSession = useAuthStore((s) => s.checkSession)
  const initialized = useAuthStore((s) => s.initialized)

  useEffect(() => {
    checkSession()
  }, [checkSession])

  if (!initialized) return null

  return <>{children}</>
}
