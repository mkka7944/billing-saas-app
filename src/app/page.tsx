'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/auth-store'

export default function Home() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const initialized = useAuthStore((s) => s.initialized)

  useEffect(() => {
    if (!initialized) return
    if (!user) { router.replace('/login'); return }
    router.replace('/map')
  }, [initialized, user, router])

  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="animate-pulse text-muted-foreground text-sm">Loading...</div>
    </div>
  )
}
