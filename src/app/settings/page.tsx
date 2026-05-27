'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTheme } from 'next-themes'
import { useAuthStore } from '@/stores/auth-store'
import { useBillingUIStore } from '@/stores/billing-ui-store'
import { AppShell } from '@/components/layout/AppShell'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem, SelectGroup } from '@/components/ui/select'
import { Building2, ChevronDown, ChevronRight, Sun, Moon, Monitor, Plus, MoreHorizontal, UserCog, KeyRound, Snowflake, Trash2, RefreshCw, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const THEMES = [
  { id: 'light', label: 'Light', icon: Sun, desc: 'Default light' },
  { id: 'dark', label: 'Dark', icon: Moon, desc: 'Default dark' },
  { id: 'vercel', label: 'Vercel', icon: Sun, desc: 'Vercel light' },
  { id: 'vercel-dark', label: 'V. Dark', icon: Moon, desc: 'Vercel dark' },
  { id: 'system', label: 'System', icon: Monitor, desc: 'Follow OS' },
]

const tabs = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'account', label: 'Account' },
  { id: 'users', label: 'Users', adminOnly: true },
] as const

type TabId = (typeof tabs)[number]['id']

interface UserRow {
  id: string
  username: string | null
  displayName: string | null
  roleName: string
  suspendedAt: string | null
  deletedAt: string | null
  createdAt: string | null
}

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

function StatusBadge({ user }: { user: UserRow }) {
  if (user.deletedAt) return <Badge variant="destructive">Deleted</Badge>
  if (user.suspendedAt) return <Badge variant="outline">Frozen</Badge>
  if (user.roleName === 'super_admin') return <Badge variant="default">Super Admin</Badge>
  if (user.roleName === 'admin') return <Badge variant="secondary">Admin</Badge>
  return <Badge variant="ghost">Staff</Badge>
}

function RoleSelect({ value, onChange, disabled }: { value: string; onChange: (v: string | null) => void; disabled?: boolean }) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem value="admin">Admin</SelectItem>
          <SelectItem value="field_staff">Field Staff</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

export default function SettingsPage() {
  const { theme, setTheme } = useTheme()
  const user = useAuthStore((s) => s.user)
  const roleName = useAuthStore((s) => s.roleName)
  const { setPageIdentity } = useBillingUIStore()
  const [activeTab, setActiveTab] = useState<TabId>('appearance')

  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(false)

  // Add user modal
  const [addOpen, setAddOpen] = useState(false)
  const [addUsername, setAddUsername] = useState('')
  const [addDisplayName, setAddDisplayName] = useState('')
  const [addPassword, setAddPassword] = useState('')
  const [addRole, setAddRole] = useState('field_staff')
  const [addSubmitting, setAddSubmitting] = useState(false)
  const [addResult, setAddResult] = useState<{ username: string; password: string } | null>(null)

  // Row action modals
  const [actionUser, setActionUser] = useState<UserRow | null>(null)
  const [editRoleOpen, setEditRoleOpen] = useState(false)
  const [editRoleValue, setEditRoleValue] = useState('field_staff')
  const [resetPwOpen, setResetPwOpen] = useState(false)
  const [resetPwValue, setResetPwValue] = useState('')

  useEffect(() => {
    setPageIdentity('Settings', 'Appearance and account')
  }, [setPageIdentity])

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/users')
      const json = await res.json()
      if (json.data) setUsers(json.data)
    } catch {} finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'users') fetchUsers()
  }, [activeTab, fetchUsers])

  async function handleAddUser() {
    setAddSubmitting(true)
    setAddResult(null)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: addUsername,
          password: addPassword,
          displayName: addDisplayName || addUsername,
          roleName: addRole,
        }),
      })
      const json = await res.json()
      if (res.ok) {
        setAddResult(json.data)
        await fetchUsers()
      } else {
        alert(json.error || 'Failed to create user')
      }
    } catch {
      alert('Network error')
    } finally {
      setAddSubmitting(false)
    }
  }

  async function handleEditRole(userId: string, newRole: string) {
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roleName: newRole }),
    })
    if (res.ok) { setEditRoleOpen(false); await fetchUsers() }
    else { const j = await res.json(); alert(j.error) }
  }

  async function handleResetPassword(userId: string, password: string) {
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (res.ok) { setResetPwOpen(false); setResetPwValue(''); alert('Password reset successfully') }
    else { const j = await res.json(); alert(j.error) }
  }

  async function handleToggleFreeze(user: UserRow) {
    const suspendedAt = user.suspendedAt ? null : new Date().toISOString()
    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ suspendedAt }),
    })
    if (res.ok) await fetchUsers()
    else { const j = await res.json(); alert(j.error) }
  }

  async function handleToggleDelete(user: UserRow) {
    if (!user.deletedAt && !confirm(`Soft-delete user "${user.username}"?`)) return
    const url = user.deletedAt
      ? `/api/admin/users/${user.id}?restore=true`
      : `/api/admin/users/${user.id}`
    const method = user.deletedAt ? 'PATCH' : 'DELETE'
    const res = await fetch(url, { method })
    if (res.ok) await fetchUsers()
    else { const j = await res.json(); alert(j.error) }
  }

  const isAdmin = roleName === 'admin' || roleName === 'super_admin'
  const visibleTabs = tabs.filter(t => !('adminOnly' in t && t.adminOnly) || isAdmin)

  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto p-3 md:p-4 lg:p-6 space-y-4 max-w-2xl">
        {/* Tab bar */}
        <div className="flex gap-1 border-b pb-0">
          {visibleTabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={cn(
                'px-4 py-2 text-sm font-semibold border-b-2 transition-colors cursor-pointer min-h-[44px]',
                activeTab === t.id
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Appearance tab */}
        {activeTab === 'appearance' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-bold">Appearance</CardTitle>
              <CardDescription className="text-xs">Customize how the app looks on your device.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <CollapsibleSection title="Theme">
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {THEMES.map(t => {
                    const isActive = theme === t.id
                    return (
                      <button
                        key={t.id}
                        onClick={() => setTheme(t.id)}
                        className={cn(
                          'flex flex-col items-center gap-1.5 p-3 rounded-lg border text-xs transition-all cursor-pointer min-h-[48px]',
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
        )}

        {/* Account tab */}
        {activeTab === 'account' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-bold">Account</CardTitle>
              <CardDescription className="text-xs">Your account information.</CardDescription>
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
        )}

        {/* Users tab */}
        {activeTab === 'users' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{users.length} user{users.length !== 1 ? 's' : ''}</p>
              <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) { setAddResult(null); setAddUsername(''); setAddDisplayName(''); setAddPassword(''); setAddRole('field_staff') } }}>
                <DialogTrigger render={<Button size="sm"><Plus className="h-4 w-4" />Add User</Button>} />
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add User</DialogTitle>
                    <DialogDescription>Create a new user account. Password shown once.</DialogDescription>
                  </DialogHeader>
                  {addResult ? (
                    <div className="space-y-3 py-2">
                      <p className="text-sm text-muted-foreground">User created successfully.</p>
                      <div className="rounded-lg border bg-muted/50 p-3 space-y-1.5">
                        <div className="flex justify-between text-sm"><span className="text-muted-foreground">Username</span><span className="font-semibold">{addResult.username}</span></div>
                        <div className="flex justify-between text-sm"><span className="text-muted-foreground">Password</span><span className="font-mono font-semibold text-destructive">{addResult.password}</span></div>
                      </div>
                      <p className="text-[11px] text-muted-foreground">This password will not be shown again. Save it now.</p>
                    </div>
                  ) : (
                    <div className="space-y-3 py-2">
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Username</label>
                        <Input value={addUsername} onChange={e => setAddUsername(e.target.value)} placeholder="e.g. ali.khan" autoComplete="off" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Display Name (optional)</label>
                        <Input value={addDisplayName} onChange={e => setAddDisplayName(e.target.value)} placeholder="e.g. Ali Khan" autoComplete="off" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Password</label>
                        <Input value={addPassword} onChange={e => setAddPassword(e.target.value)} type="text" placeholder="Min 6 characters" autoComplete="off" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">Role</label>
                        <RoleSelect value={addRole} onChange={(v) => v && setAddRole(v)} />
                      </div>
                    </div>
                  )}
                  <DialogFooter>
                    {addResult ? (
                      <DialogClose render={<Button variant="default">Done</Button>} />
                    ) : (
                      <>
                        <DialogClose render={<Button variant="outline">Cancel</Button>} />
                        <Button onClick={handleAddUser} disabled={addSubmitting || !addUsername || !addPassword || addPassword.length < 6}>
                          {addSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                          Create User
                        </Button>
                      </>
                    )}
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {/* Users table */}
            <Card>
              <div className="divide-y">
                {loading ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />Loading...
                  </div>
                ) : users.length === 0 ? (
                  <div className="text-center py-8 text-sm text-muted-foreground">No users found</div>
                ) : (
                  users.map(u => (
                    <div key={u.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold truncate">{u.displayName || u.username || '—'}</span>
                          <StatusBadge user={u} />
                        </div>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          @{u.username || '—'} · {u.roleName.replace('_', ' ')}
                        </p>
                      </div>
                      <Select value="" onValueChange={(v) => {
                        if (v === 'edit-role') { setActionUser(u); setEditRoleValue(u.roleName === 'super_admin' ? 'admin' : u.roleName); setEditRoleOpen(true) }
                        else if (v === 'reset-pw') { setActionUser(u); setResetPwOpen(true) }
                        else if (v === 'freeze') handleToggleFreeze(u)
                        else if (v === 'delete') handleToggleDelete(u)
                      }}>
                        <SelectTrigger size="sm" className="min-w-[36px] w-9 h-9 p-0 flex items-center justify-center">
                          <MoreHorizontal className="h-4 w-4" />
                        </SelectTrigger>
                        <SelectContent align="end" alignItemWithTrigger={false}>
                          <SelectGroup>
                            <SelectItem value="edit-role" disabled={u.roleName === 'super_admin'}><UserCog className="h-3.5 w-3.5" />Edit Role</SelectItem>
                            <SelectItem value="reset-pw"><KeyRound className="h-3.5 w-3.5" />Reset Password</SelectItem>
                            <SelectItem value="freeze" disabled={!!u.deletedAt}>{u.suspendedAt ? <RefreshCw className="h-3.5 w-3.5" /> : <Snowflake className="h-3.5 w-3.5" />}{u.suspendedAt ? 'Unfreeze' : 'Freeze'}</SelectItem>
                            <SelectItem value="delete" disabled={u.roleName === 'super_admin'}>{u.deletedAt ? <RefreshCw className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}{u.deletedAt ? 'Restore' : 'Delete'}</SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </div>
                  ))
                )}
              </div>
            </Card>

            {/* Edit Role dialog */}
            <Dialog open={editRoleOpen} onOpenChange={setEditRoleOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Edit Role</DialogTitle>
                  <DialogDescription>Change role for {actionUser?.username}</DialogDescription>
                </DialogHeader>
                <div className="py-2">
                  <RoleSelect value={editRoleValue} onChange={(v) => v && setEditRoleValue(v)} />
                </div>
                <DialogFooter>
                  <DialogClose render={<Button variant="outline">Cancel</Button>} />
                  <Button onClick={() => actionUser && handleEditRole(actionUser.id, editRoleValue)}>Save</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Reset Password dialog */}
            <Dialog open={resetPwOpen} onOpenChange={(o) => { setResetPwOpen(o); if (!o) setResetPwValue('') }}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Reset Password</DialogTitle>
                  <DialogDescription>New password for {actionUser?.username}</DialogDescription>
                </DialogHeader>
                <div className="py-2">
                  <Input value={resetPwValue} onChange={e => setResetPwValue(e.target.value)} type="text" placeholder="Min 6 characters" autoComplete="off" />
                </div>
                <DialogFooter>
                  <DialogClose render={<Button variant="outline">Cancel</Button>} />
                  <Button onClick={() => actionUser && handleResetPassword(actionUser.id, resetPwValue)} disabled={resetPwValue.length < 6}>Reset</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>
    </AppShell>
  )
}
