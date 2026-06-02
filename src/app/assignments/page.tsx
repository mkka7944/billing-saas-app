'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/auth-store'
import { AppShell } from '@/components/layout/AppShell'
import { CreateAssignmentTab } from '@/components/assignments/create-assignment-tab'
import { ManageAssignmentsTab } from '@/components/assignments/manage-assignments-tab'
import { RoutesTab } from '@/components/assignments/routes-tab'
import { useBillingUIStore } from '@/stores/billing-ui-store'

type Tab = 'create' | 'manage' | 'routes'

const TABS: { key: Tab; label: string }[] = [
  { key: 'create', label: 'Create' },
  { key: 'manage', label: 'Manage' },
  { key: 'routes', label: 'Routes' },
]

export default function AssignmentsPage() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const setPageIdentity = useBillingUIStore((s) => s.setPageIdentity)
  const [tab, setTab] = useState<Tab>('create')

  useEffect(() => {
    if (!user) router.replace('/login')
  }, [user, router])

  useEffect(() => { setPageIdentity('Assignments') }, [setPageIdentity])

  if (!user) return null

  return (
    <AppShell>
      <div className="flex flex-col h-full">
        <div className="flex gap-1 px-4 border-b overflow-x-auto shrink-0">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
                tab === t.key
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {tab === 'create' && <CreateAssignmentTab />}
          {tab === 'manage' && <ManageAssignmentsTab />}
          {tab === 'routes' && <RoutesTab />}
        </div>
      </div>
    </AppShell>
  )
}
