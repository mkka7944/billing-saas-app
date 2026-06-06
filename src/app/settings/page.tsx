'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTheme } from 'next-themes'
import { useAuthStore } from '@/stores/auth-store'
import { useBillingUIStore } from '@/stores/billing-ui-store'
import { AppShell } from '@/components/layout/AppShell'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem, SelectGroup } from '@/components/ui/select'
import { Building2, ChevronDown, ChevronRight, Sun, Moon, Plus, MoreHorizontal, UserCog, KeyRound, Snowflake, Trash2, RefreshCw, Loader2, Save, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { useToast } from '@/hooks/use-toast'
import { UnsentImagesSection } from '@/components/settings/unsent-images-section'
import { DeliveryTable } from '@/components/settings/delivery-table'

const THEMES = [
  { id: 'light', label: 'Light', icon: Sun, desc: 'Default light' },
  { id: 'dark', label: 'Dark', icon: Moon, desc: 'Default dark' },
]

const tabs = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'account', label: 'Account' },
  { id: 'unsent', label: 'Unsent Images' },
  { id: 'delivery', label: 'Delivery', adminOnly: true },
  { id: 'users', label: 'Users', adminOnly: true },
] as const

type TabId = (typeof tabs)[number]['id']

interface UserRow {
  id: string
  username: string | null
  displayName: string | null
  roleName: string
  assignedCity: string | null
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
      <SelectTrigger className={cn(
        'w-full font-medium',
        value === 'admin' && 'text-blue-600 dark:text-blue-400',
        value === 'field_staff' && 'text-muted-foreground'
      )}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem value="admin">
            <span className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
              <span>Admin</span>
            </span>
          </SelectItem>
          <SelectItem value="field_staff">
            <span className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 shrink-0" />
              <span>Field Staff</span>
            </span>
          </SelectItem>
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
  const [addCity, setAddCity] = useState('')
  const [addSubmitting, setAddSubmitting] = useState(false)
  const [addResult, setAddResult] = useState<{ username: string; password: string } | null>(null)

  // Row action modals
  const [actionUser, setActionUser] = useState<UserRow | null>(null)
  const [editRoleOpen, setEditRoleOpen] = useState(false)
  const [editRoleValue, setEditRoleValue] = useState('field_staff')
  const [resetPwOpen, setResetPwOpen] = useState(false)
  const [resetPwValue, setResetPwValue] = useState('')
  const [editCityOpen, setEditCityOpen] = useState(false)
  const [editCityValue, setEditCityValue] = useState<string | null>('')
  const [editCitySaving, setEditCitySaving] = useState(false)

  // Delivery settings
  const [deliverySettings, setDeliverySettings] = useState<{ enforce: boolean; threshold: number } | null>(null)
  const [deliveryEnforce, setDeliveryEnforce] = useState(true)
  const [deliveryThreshold, setDeliveryThreshold] = useState(50)
  const [allowNoPhoto, setAllowNoPhoto] = useState(false)
  const [savedAllowNoPhoto, setSavedAllowNoPhoto] = useState(false)
  const [deliverySaving, setDeliverySaving] = useState(false)

  // Staff notification form
  const [notifyUserId, setNotifyUserId] = useState('')
  const [notifySubject, setNotifySubject] = useState('')
  const [notifyBody, setNotifyBody] = useState('')
  const [notifySending, setNotifySending] = useState(false)
  const notifyUserList = useMemo(() => users.filter(u => u.roleName === 'field_staff' && !u.deletedAt && !u.suspendedAt), [users])
  const notifyUserLabel = useMemo(() => {
    if (!notifyUserId || notifyUserId === '__all') return ''
    const u = notifyUserList.find(x => x.id === notifyUserId)
    return u ? (u.displayName || u.username || '') : ''
  }, [notifyUserId, notifyUserList])

  const confirm = useConfirm()
  const { toast } = useToast()

  useEffect(() => {
    setPageIdentity('Settings', 'Appearance and account')
  }, [setPageIdentity])

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/users')
      const json = await res.json()
      if (json.data) setUsers(json.data)
    } catch { console.warn('fetchUsers: failed to fetch user list') } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'users' || activeTab === 'delivery') fetchUsers()
  }, [activeTab, fetchUsers])

  useEffect(() => {
    if (activeTab === 'delivery') {
      fetch('/api/settings')
        .then(r => r.json())
        .then(data => {
          const gps = data?.gps_enforcement || {}
          setDeliveryEnforce(gps.enforce !== false)
          setDeliveryThreshold(typeof gps.threshold === 'number' ? gps.threshold : 50)
          setDeliverySettings({ enforce: gps.enforce !== false, threshold: typeof gps.threshold === 'number' ? gps.threshold : 50 })
          setAllowNoPhoto(data?.allow_no_photo === true)
          setSavedAllowNoPhoto(data?.allow_no_photo === true)
        })
        .catch(() => toast('Failed to load settings', 'error'))
    }
  }, [activeTab, toast])

  async function handleSaveDelivery() {
    setDeliverySaving(true)
    try {
      const res1 = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: 'gps_enforcement',
          value: { enforce: deliveryEnforce, threshold: deliveryThreshold },
        }),
      })
      const res2 = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: 'allow_no_photo',
          value: allowNoPhoto,
        }),
      })
      if (res1.ok && res2.ok) {
        setDeliverySettings({ enforce: deliveryEnforce, threshold: deliveryThreshold })
        setSavedAllowNoPhoto(allowNoPhoto)
        toast('Delivery settings saved', 'success')
      } else {
        const j = await (res1.ok ? res2 : res1).json()
        toast(j.error || 'Failed to save', 'error')
      }
    } catch {
      toast('Network error', 'error')
    } finally {
      setDeliverySaving(false)
    }
  }

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
          assignedCity: addCity || null,
        }),
      })
      const json = await res.json()
      if (res.ok) {
        setAddResult(json.data)
        await fetchUsers()
      } else {
        toast(json.error || 'Failed to create user', 'error')
      }
    } catch {
      toast('Network error', 'error')
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
    else { const j = await res.json(); toast(j.error, 'error') }
  }

  async function handleResetPassword(userId: string, password: string) {
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (res.ok) { setResetPwOpen(false); setResetPwValue(''); toast('Password reset successfully', 'success') }
    else { const j = await res.json(); toast(j.error, 'error') }
  }

  async function handleToggleFreeze(user: UserRow) {
    const suspendedAt = user.suspendedAt ? null : new Date().toISOString()
    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ suspendedAt }),
    })
    if (res.ok) await fetchUsers()
    else { const j = await res.json(); toast(j.error, 'error') }
  }

  async function handleToggleDelete(user: UserRow) {
    if (!user.deletedAt) {
      const ok = await confirm({
        title: 'Delete User',
        message: `Soft-delete user "${user.username}"? They will be unable to log in.`,
        confirmLabel: 'Delete',
        variant: 'destructive',
      })
      if (!ok) return
    }
    const url = user.deletedAt
      ? `/api/admin/users/${user.id}?restore=true`
      : `/api/admin/users/${user.id}`
    const method = user.deletedAt ? 'PATCH' : 'DELETE'
    const res = await fetch(url, { method })
    if (res.ok) await fetchUsers()
    else { const j = await res.json(); toast(j.error, 'error') }
  }

  async function handleEditCity(userId: string, city: string | null) {
    setEditCitySaving(true)
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignedCity: city }),
    })
    const json = await res.json()
    setEditCitySaving(false)
    if (res.ok) { setEditCityOpen(false); await fetchUsers(); toast('City updated', 'success') }
    else { toast(json.error || 'Failed to update city', 'error') }
  }

  async function handleSendNotification() {
    if (!notifyUserId || !notifySubject || !notifyBody) return
    setNotifySending(true)
    try {
      const body: any = { title: notifySubject, body: notifyBody }
      if (notifyUserId === '__all') {
        body.all_staff = true
      } else {
        body.user_id = notifyUserId
      }
      const res = await fetch('/api/admin/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        setNotifySubject('')
        setNotifyBody('')
        setNotifyUserId('')
        toast('Notification sent', 'success')
      } else {
        const j = await res.json()
        toast(j.error || 'Failed to send', 'error')
      }
    } catch {
      toast('Network error', 'error')
    } finally {
      setNotifySending(false)
    }
  }

  const hasChanges =
    deliverySettings != null && (
      deliveryEnforce !== deliverySettings.enforce ||
      deliveryThreshold !== deliverySettings.threshold ||
      allowNoPhoto !== savedAllowNoPhoto
    )

  const isAdmin = roleName === 'admin' || roleName === 'super_admin'
  const visibleTabs = tabs.filter(t => !('adminOnly' in t && t.adminOnly) || isAdmin)

  const sortedUsers = useMemo(() => {
    const cityOrder: Record<string, number> = { Sargodha: 0, Bhalwal: 1, Khushab: 2 }
    return [...users].sort((a, b) => {
      const roleOrder: Record<string, number> = { super_admin: 0, admin: 1, field_staff: 2 }
      const aRole = roleOrder[a.roleName] ?? 99
      const bRole = roleOrder[b.roleName] ?? 99
      if (aRole !== bRole) return aRole - bRole
      const aCity = cityOrder[a.assignedCity ?? ''] ?? 99
      const bCity = cityOrder[b.assignedCity ?? ''] ?? 99
      if (aCity !== bCity) return aCity - bCity
      return (a.displayName || a.username || '').localeCompare(b.displayName || b.username || '')
    })
  }, [users])

  return (
    <AppShell>
      <div className={cn('h-full overflow-y-auto p-3 md:p-4 lg:p-6 space-y-4', activeTab === 'delivery' || activeTab === 'users' ? 'max-w-full' : 'max-w-2xl')}>
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

        {/* Unsent Images tab */}
        {activeTab === 'unsent' && (
          <div className="space-y-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-bold">Unsent Images</CardTitle>
                <CardDescription className="text-xs">Photos that failed to sync to Google Drive. Retry individually or all at once.</CardDescription>
              </CardHeader>
            </Card>
            <UnsentImagesSection />
          </div>
        )}

        {/* Delivery tab (admin-only) — sidebar + table layout */}
        {activeTab === 'delivery' && (
          <div className="flex flex-col md:flex-row gap-4">
            {/* Left sidebar — Delivery settings */}
            <div className="w-full md:w-[260px] shrink-0 space-y-3">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-bold">Delivery Settings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* GPS Enforcement */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">GPS Enforcement</span>
                      <Switch checked={deliveryEnforce} onCheckedChange={setDeliveryEnforce} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-muted-foreground">Threshold (meters)</label>
                      <Input type="number" min={1} max={500} value={deliveryThreshold}
                        onChange={(e) => setDeliveryThreshold(Number(e.target.value))}
                        disabled={!deliveryEnforce} className="h-8 text-xs" />
                    </div>
                  </div>

                  <Separator />

                  {/* No-Photo Delivery */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-medium">No-Photo Delivery</span>
                        {allowNoPhoto && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">Records GPS + timestamp only</p>
                        )}
                      </div>
                      <Switch checked={allowNoPhoto} onCheckedChange={setAllowNoPhoto} />
                    </div>
                  </div>

                  <Separator />

                  {/* Save button */}
                  <Button onClick={handleSaveDelivery} disabled={!hasChanges || deliverySaving} size="sm" className="w-full h-8 text-xs">
                    {deliverySaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                    Save
                  </Button>
                  {deliverySettings && (
                    <div className="text-[10px] text-muted-foreground space-y-0.5">
                      <p>GPS: {deliverySettings.enforce ? `${deliverySettings.threshold}m` : 'Off'}</p>
                      <p>No-Photo: {savedAllowNoPhoto ? 'On' : 'Off'}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

            </div>

            {/* Main — delivery records table */}
            <div className="flex-1 min-w-0">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-bold">Delivery Records</CardTitle>
                  <CardDescription className="text-[11px]">All delivered and processing items across all UCs. Select rows to revoke.</CardDescription>
                </CardHeader>
                <CardContent>
                  <DeliveryTable />
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Users tab */}
        {activeTab === 'users' && (
          <div className="flex flex-col md:flex-row gap-4">
            {/* Left sidebar — Staff Notifications */}
            <div className="w-full md:w-[260px] shrink-0">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-bold">Staff Notifications</CardTitle>
                  <CardDescription className="text-[11px]">Send a notification to field staff.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Recipient</label>
                    <Select value={notifyUserId} onValueChange={v => v && setNotifyUserId(v)}>
                      <SelectTrigger className="h-8 text-xs w-full">
                        <SelectValue placeholder="Select staff...">{notifyUserLabel || ''}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="__all">All Staff</SelectItem>
                          {notifyUserList.map(u => (
                            <SelectItem key={u.id} value={u.id}>{u.displayName || u.username || u.id}</SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Subject</label>
                    <Input value={notifySubject} onChange={e => setNotifySubject(e.target.value)} placeholder="e.g. Reminder" className="h-8 text-xs" />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Message</label>
                    <textarea
                      value={notifyBody}
                      onChange={e => setNotifyBody(e.target.value)}
                      placeholder="Type your message..."
                      rows={3}
                      className="w-full text-xs rounded-lg border border-border bg-background px-3 py-2 outline-none focus:ring-1 focus:ring-ring transition-shadow resize-none"
                    />
                  </div>
                  <Button onClick={handleSendNotification} disabled={notifySending || !notifyUserId || !notifySubject || !notifyBody} size="sm" className="w-full h-8 text-xs">
                    {notifySending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                    Send
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Main — Users table */}
            <div className="flex-1 min-w-0 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{users.length} user{users.length !== 1 ? 's' : ''}</p>
                <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) { setAddResult(null); setAddUsername(''); setAddDisplayName(''); setAddPassword(''); setAddRole('field_staff'); setAddCity('') } }}>
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
                        <p className="text-xs text-muted-foreground">This password will not be shown again. Save it now.</p>
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
                        <div>
                          <label className="text-xs font-medium text-muted-foreground mb-1 block">City (optional)</label>
                          <Select value={addCity} onValueChange={(v) => setAddCity(v || '')}>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select city..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                <SelectItem value="Sargodha"><span className="text-emerald-600 dark:text-emerald-400">Sargodha</span></SelectItem>
                                <SelectItem value="Bhalwal"><span className="text-blue-600 dark:text-blue-400">Bhalwal</span></SelectItem>
                                <SelectItem value="Khushab"><span className="text-amber-600 dark:text-amber-400">Khushab</span></SelectItem>
                                <SelectItem value="">— None —</SelectItem>
                              </SelectGroup>
                            </SelectContent>
                          </Select>
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

              <Card>
                {loading ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />Loading...
                  </div>
                ) : users.length === 0 ? (
                  <div className="text-center py-8 text-sm text-muted-foreground">No users found</div>
                ) : (
                  <div className="rounded-lg border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="text-xs">
                          <TableHead className="min-w-[140px]">Name</TableHead>
                          <TableHead className="min-w-[100px]">Username</TableHead>
                          <TableHead className="min-w-[80px]">Role</TableHead>
                          <TableHead className="min-w-[80px]">City</TableHead>
                          <TableHead className="min-w-[70px]">Status</TableHead>
                          <TableHead className="w-16">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(() => {
                          const groups: { label: string; users: UserRow[] }[] = []
                          let current: UserRow[] = []
                          let currentLabel = ''
                          function flush() {
                            if (current.length > 0) {
                              groups.push({ label: currentLabel, users: [...current] })
                              current = []
                            }
                          }
                          for (const u of sortedUsers) {
                            let label = ''
                            if (u.roleName === 'super_admin') label = '★ Super Admin'
                            else if (u.roleName === 'admin') label = 'Admin'
                            else if (u.assignedCity) label = u.assignedCity
                            else label = 'Unassigned'
                            if (label !== currentLabel) { flush(); currentLabel = label }
                            current.push(u)
                          }
                          flush()
                          return groups.flatMap((g, gi) => [
                            <TableRow key={`h-${gi}`} className="bg-muted/30">
                              <TableCell colSpan={6} className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wider">
                                <span className={cn(
                                  g.label === 'Sargodha' && 'text-emerald-600 dark:text-emerald-400',
                                  g.label === 'Bhalwal' && 'text-blue-600 dark:text-blue-400',
                                  g.label === 'Khushab' && 'text-amber-600 dark:text-amber-400',
                                  g.label === '★ Super Admin' && 'text-foreground',
                                  g.label === 'Admin' && 'text-foreground',
                                  g.label === 'Unassigned' && 'text-muted-foreground',
                                  !['Sargodha','Bhalwal','Khushab','★ Super Admin','Admin','Unassigned'].includes(g.label) && 'text-muted-foreground'
                                )}>{g.label}</span>
                              </TableCell>
                            </TableRow>,
                            ...g.users.map(u => (
                              <TableRow key={u.id} className="text-xs">
                                <TableCell className="font-medium whitespace-nowrap">{u.displayName || u.username || '—'}</TableCell>
                                <TableCell className="text-muted-foreground">@{u.username || '—'}</TableCell>
                                <TableCell><StatusBadge user={u} /></TableCell>
                                <TableCell className="text-muted-foreground">{u.assignedCity || '—'}</TableCell>
                                <TableCell>
                                  {u.deletedAt ? <Badge variant="destructive" className="text-[10px]">Deleted</Badge>
                                    : u.suspendedAt ? <Badge variant="outline" className="text-[10px]">Frozen</Badge>
                                    : <Badge variant="ghost" className="text-[10px]">Active</Badge>}
                                </TableCell>
                                <TableCell>
                                  <Select value="" onValueChange={(v) => {
                                    if (v === 'edit-role') { setActionUser(u); setEditRoleValue(u.roleName === 'super_admin' ? 'admin' : u.roleName); setEditRoleOpen(true) }
                                    else if (v === 'edit-city') { setActionUser(u); setEditCityValue(u.assignedCity || ''); setEditCityOpen(true) }
                                    else if (v === 'reset-pw') { setActionUser(u); setResetPwOpen(true) }
                                    else if (v === 'freeze') handleToggleFreeze(u)
                                    else if (v === 'delete') handleToggleDelete(u)
                                  }}>
                                    <SelectTrigger hideChevron size="sm" className="size-7 p-0 flex items-center justify-center">
                                      <MoreHorizontal className="size-3.5" />
                                    </SelectTrigger>
                                    <SelectContent align="end" alignItemWithTrigger={false}>
                                      <SelectGroup>
                                        <SelectItem value="edit-role" disabled={u.roleName === 'super_admin'}><UserCog className="h-3.5 w-3.5" />Edit Role</SelectItem>
                                        <SelectItem value="edit-city"><Building2 className="h-3.5 w-3.5" />Edit City</SelectItem>
                                        <SelectItem value="reset-pw"><KeyRound className="h-3.5 w-3.5" />Reset Password</SelectItem>
                                        <SelectItem value="freeze" disabled={!!u.deletedAt}>{u.suspendedAt ? <RefreshCw className="h-3.5 w-3.5" /> : <Snowflake className="h-3.5 w-3.5" />}{u.suspendedAt ? 'Unfreeze' : 'Freeze'}</SelectItem>
                                        <SelectItem value="delete" disabled={u.roleName === 'super_admin'}>{u.deletedAt ? <RefreshCw className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}{u.deletedAt ? 'Restore' : 'Delete'}</SelectItem>
                                      </SelectGroup>
                                    </SelectContent>
                                  </Select>
                                </TableCell>
                              </TableRow>
                            ))
                          ])
                        })()}
                      </TableBody>
                    </Table>
                  </div>
                )}
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

            {/* Edit City dialog */}
            <Dialog open={editCityOpen} onOpenChange={(o) => { setEditCityOpen(o); if (!o) setEditCityValue('') }}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Edit City</DialogTitle>
                  <DialogDescription>Assign city for {actionUser?.username}</DialogDescription>
                </DialogHeader>
                <div className="py-2">
                  <Select value={editCityValue} onValueChange={(v) => setEditCityValue(v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select city..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="Sargodha"><span className="text-emerald-600 dark:text-emerald-400">Sargodha</span></SelectItem>
                        <SelectItem value="Bhalwal"><span className="text-blue-600 dark:text-blue-400">Bhalwal</span></SelectItem>
                        <SelectItem value="Khushab"><span className="text-amber-600 dark:text-amber-400">Khushab</span></SelectItem>
                        <SelectItem value="">— None —</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter>
                  <Button onClick={() => actionUser && handleEditCity(actionUser.id, editCityValue || null)} disabled={editCitySaving}>
                    {editCitySaving ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Saving...</> : 'Save'}
                  </Button>
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
        </div>
        )}
      </div>
    </AppShell>
  )
}
