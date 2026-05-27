'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Building2, Loader2 } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const { signIn, user, initialized, isLoading } = useAuthStore()
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (initialized && user) router.replace('/map')
  }, [initialized, user, router])

  if (!initialized) {
    return (
      <div className="flex flex-1 items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <Skeleton className="h-8 w-32 mx-auto mb-2" />
            <Skeleton className="h-4 w-40 mx-auto" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    )
  }

  if (user) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const result = await signIn(login, password)
    setSubmitting(false)
    if (result.error) setError(result.error)
    else router.replace('/map')
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm animate-in fade-in duration-500">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Building2 className="h-8 w-8 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold font-display">TMT Billing</CardTitle>
          <CardDescription>Sign in with your username or email</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="login" className="text-sm font-medium">Username or Email</label>
              <Input id="login" type="text" value={login} onChange={(e) => setLogin(e.target.value)} placeholder="your_username" required autoComplete="username" />
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">Password</label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required autoComplete="current-password" />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={submitting || isLoading}>
              {submitting ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Signing in...</>
              ) : (
                'Sign in'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
