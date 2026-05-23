'use client'

import { useState } from 'react'
import { useTheme } from 'next-themes'
import { useAuthStore } from '@/stores/auth-store'
import { useBillingUIStore } from '@/stores/billing-ui-store'
import { AppShell } from '@/components/layout/AppShell'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Building2, ChevronDown, ChevronRight, Sun, Moon, Monitor } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useEffect } from 'react'

const THEMES = [
  { id: 'light', label: 'Light', icon: Sun, desc: 'Default light' },
  { id: 'dark', label: 'Dark', icon: Moon, desc: 'Default dark' },
  { id: 'vercel', label: 'Vercel', icon: Sun, desc: 'Vercel light' },
  { id: 'vercel-dark', label: 'V. Dark', icon: Moon, desc: 'Vercel dark' },
  { id: 'system', label: 'System', icon: Monitor, desc: 'Follow OS' },
]

function CollapsibleSection({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 cursor-pointer hover:text-foreground transition-colors"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {title}
      </button>
      {open && <div className="animate-in slide-in-from-top-1 duration-200">{children}</div>}
    </div>
  )
}

export default function SettingsPage() {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const user = useAuthStore((s) => s.user)
  const { setPageIdentity } = useBillingUIStore()

  useEffect(() => {
    setPageIdentity('Settings', 'Appearance and account')
  }, [setPageIdentity])

  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto p-3 md:p-4 lg:p-6 space-y-4 max-w-2xl">
        {/* Appearance */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-bold">Appearance</CardTitle>
            <CardDescription className="text-xs">
              Customize how the app looks on your device.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <CollapsibleSection title="Theme">
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {THEMES.map((t) => {
                  const isActive = theme === t.id
                  return (
                    <button
                      key={t.id}
                      onClick={() => setTheme(t.id)}
                      className={cn(
                        'flex flex-col items-center gap-1.5 p-3 rounded-lg border text-xs transition-all cursor-pointer',
                        isActive
                          ? 'border-primary bg-primary/5 text-primary shadow-sm'
                          : 'border-border hover:border-primary/50 hover:bg-muted/50 text-muted-foreground'
                      )}
                    >
                      <t.icon className={cn('h-5 w-5', isActive && 'text-primary')} />
                      <span className="font-semibold">{t.label}</span>
                      <span className="text-[10px] text-muted-foreground">{t.desc}</span>
                    </button>
                  )
                })}
              </div>
            </CollapsibleSection>
          </CardContent>
        </Card>

        {/* Account */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-bold">Account</CardTitle>
            <CardDescription className="text-xs">
              Your account information.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold">{user?.email?.split('@')[0] || 'Operator'}</p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
              </div>
            </div>
            <Separator />
            <div className="text-xs text-muted-foreground">
              User ID: <span className="font-mono text-foreground">{user?.id}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}
