'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Building2, Loader2, AlertCircle } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const { signIn, user, initialized, isLoading } = useAuthStore()
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [forgotOpen, setForgotOpen] = useState(false)

  useEffect(() => {
    if (initialized && user) router.replace('/map')
  }, [initialized, user, router])

  if (!initialized) {
    return (
      <div className="flex flex-1 items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-100 dark:from-slate-900 dark:via-slate-800 dark:to-indigo-950 p-4">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-pulse-subtle">
            <div className="p-3 rounded-2xl bg-primary/10">
              <Building2 className="h-10 w-10 text-primary" />
            </div>
          </div>
          <div className="h-5 w-32 bg-muted rounded animate-pulse" />
          <div className="h-4 w-48 bg-muted rounded animate-pulse" />
        </div>
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
    <>
      <div className="flex flex-1 items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-100 dark:from-slate-900 dark:via-slate-800 dark:to-indigo-950 p-4">
        <Card className="w-full max-w-sm shadow-xl ring-1 ring-foreground/5 animate-in fade-in duration-500">
          <CardHeader className="text-center pt-8 pb-6">
            <div className="flex justify-center mb-4">
              <div className="p-3 rounded-2xl bg-primary/10 ring-1 ring-primary/20">
                <Building2 className="h-10 w-10 text-primary" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold font-display">TMT Billing</CardTitle>
            <CardDescription>Field staff bill delivery & verification</CardDescription>
          </CardHeader>
          <CardContent className="pb-8">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="login" className="text-sm font-medium text-foreground/80">Username or Email</label>
                <Input id="login" type="text" value={login} onChange={(e) => setLogin(e.target.value)} placeholder="your_username" required autoComplete="username" />
              </div>
              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium text-foreground/80">Password</label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required autoComplete="current-password" />
              </div>
              {error && (
                <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              <Button type="submit" className="w-full h-11" disabled={submitting || isLoading}>
                {submitting ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Signing in...</>
                ) : (
                  'Sign in'
                )}
              </Button>
            </form>
            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={() => setForgotOpen(true)}
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
              >
                Forgot password?
              </button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="fixed bottom-4 left-0 right-0 text-center">
        <p className="text-xs text-muted-foreground/50">v1.0.0</p>
      </div>

      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Forgot Password</DialogTitle>
            <DialogDescription>
              Please contact your administrator to reset your password.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setForgotOpen(false)}>
              Got it
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
