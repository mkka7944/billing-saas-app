# Data Insight Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin-only Data Insight view inside the `/map` SPA hub that shows aggregated KPIs + drill-down table with the same global filters.

**Architecture:** New SPA view (ActiveView: `'data-insight'`) renders inside AppShell alongside map/list/route/stats. New API route `/api/data-insight` aggregates survey_units + bill_items + payment_history with chunked pagination. Role gating via `auth-store.role` queried from `profiles` table.

**Tech Stack:** Next.js 16 App Router, Supabase (service role), Zustand, TanStack Query, shadcn Table/Card

---

### Task 1: Add `data-insight` to ActiveView type + billing store

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/stores/billing-store.ts`

- [ ] **Step 1: Update ActiveView type**

In `src/types/index.ts`, change line 4 from:
```ts
type ActiveView = 'map' | 'list' | 'route' | 'stats' | 'detail'
```
to:
```ts
type ActiveView = 'map' | 'list' | 'route' | 'stats' | 'detail' | 'data-insight'
```

- [ ] **Step 2: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add data-insight to ActiveView type"
```

---

### Task 2: Add `role` to auth-store for admin gating

**Files:**
- Modify: `src/stores/auth-store.ts`

- [ ] **Step 1: Add role state + fetch logic**

In `src/stores/auth-store.ts`, read the full current file then replace with:

```ts
import { create } from 'zustand'
import { createClient } from '@/lib/supabase/client'
import type { User, Session } from '@supabase/supabase-js'

interface AuthState {
  user: User | null
  session: Session | null
  isLoading: boolean
  initialized: boolean
  role: string
  setUser: (user: User | null) => void
  setSession: (session: Session | null) => void
  setInitialized: (val: boolean) => void
  checkSession: () => Promise<void>
  signOut: () => Promise<void>
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  isLoading: true,
  initialized: false,
  role: 'staff',

  setUser: (user) => set({ user }),
  setSession: (session) => set({ session }),
  setInitialized: (val) => set({ initialized: val }),

  checkSession: async () => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user ?? null
    let role = 'staff'
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()
      if (profile?.role) role = profile.role
    }
    set({
      session,
      user,
      role,
      isLoading: false,
      initialized: true,
    })
  },

  signOut: async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    set({ user: null, session: null, role: 'staff' })
  },

  signIn: async (email, password) => {
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error: error.message }
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user ?? null
    let role = 'staff'
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()
      if (profile?.role) role = profile.role
    }
    set({ session, user, role, isLoading: false })
    return { error: null }
  },
}))
```

- [ ] **Step 2: Commit**

```bash
git add src/stores/auth-store.ts
git commit -m "feat: add role to auth-store for admin gating"
```

---

### Task 3: Create `/api/data-insight` route

**Files:**
- Create: `src/app/api/data-insight/route.ts`

- [ ] **Step 1: Create the API route**

Create `src/app/api/data-insight/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { FilterState } from '@/types'

export const dynamic = 'force-dynamic'
export const revalidate = 300

interface AggregationRow {
  level: 'district' | 'tehsil' | 'uc' | 'unit'
  district: string
  tehsil?: string
  uc_name?: string
  total_units: number
  active: number
  billed: number
  paid: number
  collected: number
  recovery_rate: number
  surveyors: number
  no_coords: number
}

interface DataInsightResponse {
  kpis: {
    total_units: number
    active_units: number
    archived_units: number
    billed_units: number
    paid_units: number
    total_collected: number
    recovery_rate: number
    unique_surveyors: number
    no_coords: number
  }
  rows: AggregationRow[]
  total: number
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const district = searchParams.get('district') || ''
  const tehsil = searchParams.get('tehsil') || ''
  const uc = searchParams.get('uc') || ''
  const surveyor = searchParams.get('surveyor') || ''
  const status = searchParams.get('status') || 'all'
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
  const pageSize = Math.min(100, Math.max(10, parseInt(searchParams.get('pageSize') || '50')))

  const supabase = await createClient()

  // Determine grouping level
  let level: 'district' | 'tehsil' | 'uc' | 'unit'
  if (!district) level = 'district'
  else if (!tehsil) level = 'tehsil'
  else if (!uc) level = 'uc'
  else level = 'unit'

  // Build base filter for survey_units
  const buildFilter = (q: any) => {
    if (district) q = q.eq('city_district', district)
    if (tehsil) q = q.eq('tehsil', tehsil)
    if (uc) q = q.eq('uc_name', uc)
    if (surveyor) q = q.eq('surveyor_name', surveyor)
    if (status === 'active') q = q.eq('status', 'ACTIVE')
    else if (status === 'archived') q = q.eq('status', 'ARCHIVED')
    return q
  }

  // Step 1: Get all matching survey_ids with chunked pagination
  const CHUNK = 1000
  const allIds: string[] = []
  const allUnits: { survey_id: string; city_district: string; tehsil: string; uc_name: string; status: string; surveyor_name: string | null; lat: number | null; lng: number | null }[] = []

  // First get total count
  let countQuery = supabase
    .from('survey_units')
    .select('*', { count: 'exact', head: true })
  countQuery = buildFilter(countQuery)
  const { count: totalCount } = await countQuery
  const total = totalCount || 0

  // Fetch in chunks
  for (let offset = 0; offset < total; offset += CHUNK) {
    let chunkQuery = supabase
      .from('survey_units')
      .select('survey_id, city_district, tehsil, uc_name, status, surveyor_name, lat, lng')
      .range(offset, offset + CHUNK - 1)
    chunkQuery = buildFilter(chunkQuery)
    const { data: chunk } = await chunkQuery
    if (chunk) {
      allUnits.push(...chunk)
      allIds.push(...chunk.map((u) => u.survey_id))
    }
  }

  if (!allUnits.length) {
    return NextResponse.json({
      kpis: {
        total_units: 0, active_units: 0, archived_units: 0,
        billed_units: 0, paid_units: 0, total_collected: 0,
        recovery_rate: 0, unique_surveyors: 0, no_coords: 0,
      },
      rows: [],
      total: 0,
    } satisfies DataInsightResponse)
  }

  // Step 2: Get bill_items for these survey_ids
  let billQuery = supabase
    .from('bill_items')
    .select('psid, survey_id, amount_due')
    .in('survey_id', allIds)
  const { data: billItems } = await billQuery
  const billedSurveyIds = new Set((billItems || []).map((b) => b.survey_id))
  const psids = (billItems || []).map((b) => b.psid)

  // Step 3: Get payment_history for these psids
  let paidRows: { psid: string; amount_paid: number | null }[] = []
  if (psids.length) {
    const { data: payments } = await supabase
      .from('payment_history')
      .select('psid, amount_paid')
      .eq('payment_status', 'paid')
      .in('psid', psids)
    paidRows = payments || []
  }

  const paidPsids = new Set(paidRows.map((p) => p.psid))
  const totalCollected = paidRows.reduce((sum, p) => sum + Number(p.amount_paid || 0), 0)

  // Step 4: KPIs
  const totalUnits = allUnits.length
  const activeUnits = allUnits.filter((u) => u.status === 'ACTIVE').length
  const archivedUnits = allUnits.filter((u) => u.status === 'ARCHIVED').length
  const noCoords = allUnits.filter((u) => !u.lat || !u.lng).length
  const uniqueSurveyors = new Set(allUnits.map((u) => u.surveyor_name).filter(Boolean)).size
  const totalExpected = (billItems || []).reduce((s, b) => s + Number(b.amount_due || 0), 0)

  const paidByPsid = new Map(paidRows.map((p) => [p.psid, Number(p.amount_paid || 0)]))

  const kpis = {
    total_units: totalUnits,
    active_units: activeUnits,
    archived_units: archivedUnits,
    billed_units: billedSurveyIds.size,
    paid_units: paidPsids.size,
    total_collected: totalCollected,
    recovery_rate: totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 10000) / 100 : 0,
    unique_surveyors: uniqueSurveyors,
    no_coords: noCoords,
  }

  // Step 5: Build aggregation rows
  const groupMap = new Map<string, AggregationRow & { _expected: number }>()

  for (const unit of allUnits) {
    const dist = unit.city_district || 'Unknown'
    const teh = unit.tehsil || 'Unknown'
    const ucn = unit.uc_name || 'Unknown'
    const key = level === 'district' ? dist
      : level === 'tehsil' ? `${dist}::${teh}`
      : level === 'uc' ? `${dist}::${teh}::${ucn}`
      : unit.survey_id

    if (!groupMap.has(key)) {
      groupMap.set(key, {
        level, district: dist,
        tehsil: level === 'district' ? undefined : teh,
        uc_name: level === 'uc' || level === 'unit' ? ucn : undefined,
        total_units: 0, active: 0, billed: 0, paid: 0,
        collected: 0, recovery_rate: 0, surveyors: 0, no_coords: 0,
        _expected: 0,
      })
    }

    const row = groupMap.get(key)!
    row.total_units++
    if (unit.status === 'ACTIVE') row.active++
    if (!unit.lat || !unit.lng) row.no_coords++
    if (unit.surveyor_name) row.surveyors++
  }

  // Enrich with billing + payment data
  for (const bill of billItems || []) {
    const unit = allUnits.find((u) => u.survey_id === bill.survey_id)
    if (!unit) continue
    const dist = unit.city_district || 'Unknown'
    const teh = unit.tehsil || 'Unknown'
    const ucn = unit.uc_name || 'Unknown'
    const key = level === 'district' ? dist
      : level === 'tehsil' ? `${dist}::${teh}`
      : level === 'uc' ? `${dist}::${teh}::${ucn}`
      : unit.survey_id

    const row = groupMap.get(key)
    if (row) {
      row.billed++
      row._expected += Number(bill.amount_due || 0)
      if (paidPsids.has(bill.psid)) {
        row.paid++
        row.collected += paidByPsid.get(bill.psid) || 0
      }
    }
  }

  // Calculate recovery rates
  for (const [, row] of groupMap) {
    row.recovery_rate = row._expected > 0
      ? Math.round((row.collected / row._expected) * 10000) / 100
      : 0
  }

  let rows = Array.from(groupMap.values()).map(({ _expected, ...rest }) => rest)

  // Sort
  if (level === 'district') rows.sort((a, b) => b.total_units - a.total_units)
  else if (level === 'tehsil') rows.sort((a, b) => a.tehsil!.localeCompare(b.tehsil!))
  else if (level === 'uc') rows.sort((a, b) => (a.uc_name || '').localeCompare(b.uc_name || ''))

  // Paginate
  const totalRows = rows.length
  const start = (page - 1) * pageSize
  rows = rows.slice(start, start + pageSize)

  return NextResponse.json({ kpis, rows, total: totalRows } satisfies DataInsightResponse)
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/data-insight/route.ts
git commit -m "feat: add data-insight API route with aggregation"
```

---

### Task 4: Create `use-data-insight` hook

**Files:**
- Create: `src/hooks/use-data-insight.ts`

- [ ] **Step 1: Create the hook**

```ts
'use client'

import { useQuery } from '@tanstack/react-query'
import type { FilterState } from '@/types'

interface AggregationRow {
  level: 'district' | 'tehsil' | 'uc' | 'unit'
  district: string
  tehsil?: string
  uc_name?: string
  total_units: number
  active: number
  billed: number
  paid: number
  collected: number
  recovery_rate: number
  surveyors: number
  no_coords: number
}

interface DataInsightResponse {
  kpis: {
    total_units: number
    active_units: number
    archived_units: number
    billed_units: number
    paid_units: number
    total_collected: number
    recovery_rate: number
    unique_surveyors: number
    no_coords: number
  }
  rows: AggregationRow[]
  total: number
}

interface UseDataInsightParams {
  filters: FilterState
  page: number
  pageSize: number
}

export function useDataInsight({ filters, page, pageSize }: UseDataInsightParams) {
  return useQuery<DataInsightResponse>({
    queryKey: ['data-insight', filters, page, pageSize],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filters.districts.length) params.set('district', filters.districts[0])
      if (filters.tehsils.length) params.set('tehsil', filters.tehsils[0])
      if (filters.ucs.length) params.set('uc', filters.ucs[0])
      if (filters.surveyor) params.set('surveyor', filters.surveyor)
      if (filters.paymentStatus !== 'all') params.set('status', filters.paymentStatus)
      params.set('page', String(page))
      params.set('pageSize', String(pageSize))

      const res = await fetch(`/api/data-insight?${params}`)
      if (!res.ok) throw new Error('Failed to fetch data insight')
      return res.json()
    },
    staleTime: 1000 * 60 * 5,
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/use-data-insight.ts
git commit -m "feat: add use-data-insight hook"
```

---

### Task 5: Create `DataInsight` component

**Files:**
- Create: `src/components/data-insight.tsx`

- [ ] **Step 1: Create the component**

```ts
'use client'

import { useState, useCallback } from 'react'
import { useBillingStore } from '@/stores/billing-store'
import { useDataInsight } from '@/hooks/use-data-insight'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, Users, Receipt, PiggyBank, Target, MapPin, UserCheck, Archive, AlertTriangle } from 'lucide-react'

const kpiConfig = [
  { key: 'total_units', label: 'Total Units', icon: Users, color: 'text-blue-600', bg: 'bg-blue-100' },
  { key: 'active_units', label: 'Active', icon: UserCheck, color: 'text-green-600', bg: 'bg-green-100' },
  { key: 'archived_units', label: 'Archived', icon: Archive, color: 'text-gray-600', bg: 'bg-gray-100' },
  { key: 'billed_units', label: 'Billed', icon: Receipt, color: 'text-emerald-600', bg: 'bg-emerald-100' },
  { key: 'paid_units', label: 'Paid', icon: PiggyBank, color: 'text-purple-600', bg: 'bg-purple-100' },
  { key: 'total_collected', label: 'Collected (Rs.)', icon: Target, color: 'text-amber-600', bg: 'bg-amber-100', format: (v: number) => `Rs. ${v.toLocaleString()}` },
  { key: 'recovery_rate', label: 'Recovery %', icon: Target, color: 'text-rose-600', bg: 'bg-rose-100', format: (v: number) => `${v}%` },
  { key: 'no_coords', label: 'No Coords', icon: AlertTriangle, color: 'text-orange-600', bg: 'bg-orange-100' },
  { key: 'unique_surveyors', label: 'Surveyors', icon: UserCheck, color: 'text-indigo-600', bg: 'bg-indigo-100' },
]

function formatNum(n: number): string {
  return n.toLocaleString()
}

export function DataInsight() {
  const filters = useBillingStore((s) => s.filters)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)

  const { data, isLoading } = useDataInsight({ filters, page, pageSize })

  const totalPages = Math.ceil((data?.total || 0) / pageSize)

  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size)
    setPage(1)
  }, [])

  if (isLoading) {
    return (
      <div className="p-4 space-y-4 overflow-y-auto h-full">
        <div className="grid grid-cols-3 lg:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2"><Skeleton className="h-3 w-16" /></CardHeader>
              <CardContent><Skeleton className="h-6 w-20" /></CardContent>
            </Card>
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const kpis = data?.kpis
  const rows = data?.rows || []

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full">
      {/* KPI Cards */}
      <div className="grid grid-cols-3 lg:grid-cols-5 gap-3">
        {kpiConfig.map((k) => {
          const value = kpis ? (kpis as any)[k.key] : 0
          const display = k.format ? k.format(value) : formatNum(value)
          return (
            <Card key={k.key}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs text-muted-foreground font-medium">{k.label}</CardTitle>
                <div className={`p-1.5 rounded ${k.bg}`}>
                  <k.icon className={`h-4 w-4 ${k.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-xl font-bold">{display}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Aggregation Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs font-semibold">
                    {data?.rows?.[0]?.level === 'district' ? 'District' :
                     data?.rows?.[0]?.level === 'tehsil' ? 'Tehsil' :
                     data?.rows?.[0]?.level === 'uc' ? 'MC/UC' : 'Survey ID'}
                  </TableHead>
                  {data?.rows?.[0]?.level !== 'district' && (
                    <TableHead className="text-xs font-semibold">Tehsil</TableHead>
                  )}
                  <TableHead className="text-xs font-semibold text-right">Units</TableHead>
                  <TableHead className="text-xs font-semibold text-right">Active</TableHead>
                  <TableHead className="text-xs font-semibold text-right">Billed</TableHead>
                  <TableHead className="text-xs font-semibold text-right">Paid</TableHead>
                  <TableHead className="text-xs font-semibold text-right">Collected</TableHead>
                  <TableHead className="text-xs font-semibold text-right">Rate</TableHead>
                  <TableHead className="text-xs font-semibold text-right">No Coords</TableHead>
                  <TableHead className="text-xs font-semibold text-right">Surveyors</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-sm font-medium">
                      {row.level === 'uc' ? row.uc_name : row.district}
                    </TableCell>
                    {row.level !== 'district' && (
                      <TableCell className="text-sm text-muted-foreground">{row.tehsil}</TableCell>
                    )}
                    <TableCell className="text-sm text-right">{formatNum(row.total_units)}</TableCell>
                    <TableCell className="text-sm text-right">{formatNum(row.active)}</TableCell>
                    <TableCell className="text-sm text-right">{formatNum(row.billed)}</TableCell>
                    <TableCell className="text-sm text-right">{formatNum(row.paid)}</TableCell>
                    <TableCell className="text-sm text-right">Rs. {row.collected.toLocaleString()}</TableCell>
                    <TableCell className="text-sm text-right">{row.recovery_rate}%</TableCell>
                    <TableCell className="text-sm text-right">{formatNum(row.no_coords)}</TableCell>
                    <TableCell className="text-sm text-right">{formatNum(row.surveyors)}</TableCell>
                  </TableRow>
                ))}
                {!rows.length && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-sm text-muted-foreground py-8">
                      No data matching the current filters
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      {data && data.total > pageSize && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <span>Rows:</span>
            {[10, 25, 50, 100].map((size) => (
              <button
                key={size}
                onClick={() => handlePageSizeChange(size)}
                className={`px-2 py-0.5 rounded text-xs font-medium cursor-pointer ${
                  pageSize === size
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted hover:bg-muted/80'
                }`}
              >
                {size}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span>Page {page} of {totalPages}</span>
            <Button
              variant="ghost"
              size="icon"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/data-insight.tsx
git commit -m "feat: add DataInsight component"
```

---

### Task 6: Wire DataInsight into `/map/page.tsx`

**Files:**
- Modify: `src/app/map/page.tsx`

- [ ] **Step 1: Import and render DataInsight**

Add import:
```ts
import { DataInsight } from '@/components/data-insight'
```

Add render block after line 34 (`{activeView === 'stats' && <KpiCards />}`):
```ts
{activeView === 'data-insight' && <DataInsight />}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/map/page.tsx
git commit -m "feat: wire DataInsight into map page"
```

---

### Task 7: Add Data Insight sidebar nav item (admin-only)

**Files:**
- Modify: `src/components/layout/BillingSidebar.tsx`

- [ ] **Step 1: Add import for role check + new icon**

At top:
```ts
import { useAuthStore } from '@/stores/auth-store'
```

In the imports, add `FileSpreadsheet` to the lucide-react import line:
```ts
import {
  MapIcon, List, Route, BarChart3, Settings, Building2,
  LogOut, PanelLeftClose, PanelLeftOpen,
  Moon, Sun, FileSpreadsheet,
} from 'lucide-react'
```

- [ ] **Step 2: Read user role in component**

Inside `BillingSidebar` component add:
```ts
const role = useAuthStore((s) => s.role)
```

- [ ] **Step 3: Add nav item in Navigation group (admin-only)**

Update `navGroups` to include Data Insight after the Stats item:
```ts
{
  category: 'Navigation',
  items: [
    { id: 'map', title: 'Map', icon: MapIcon, isView: true },
    { id: 'list', title: 'List', icon: List, isView: true },
    { id: 'route', title: 'Route', icon: Route, isView: true },
    { id: 'stats', title: 'Stats', icon: BarChart3, isView: true },
    ...(role === 'admin'
      ? [{ id: 'data-insight', title: 'Data Insight', icon: FileSpreadsheet, isView: true }]
      : []),
  ],
},
```

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/BillingSidebar.tsx
git commit -m "feat: add Data Insight nav item for admin users"
```

---

### Task 8: Add Data Insight bottom tab for admin on mobile

**Files:**
- Modify: `src/components/layout/AppShell.tsx`

- [ ] **Step 1: Add import for role + icon**

Add/update imports:
```ts
import { useAuthStore } from '@/stores/auth-store'
import { FileSpreadsheet } from 'lucide-react'
```

Remove duplicate `useAuthStore` import if exists.

- [ ] **Step 2: Get role in component**

Inside `AppShell` add:
```ts
const role = useAuthStore((s) => s.role)
```

- [ ] **Step 3: Conditionally add tab**

Update the `tabs` array:
```ts
const tabs = [
  { id: 'map' as const, label: 'Map', icon: MapIcon },
  { id: 'list' as const, label: 'List', icon: List },
  { id: 'route' as const, label: 'Route', icon: Route },
  { id: 'stats' as const, label: 'Stats', icon: BarChart3 },
  ...(role === 'admin'
    ? [{ id: 'data-insight' as const, label: 'Insight', icon: FileSpreadsheet }]
    : []),
]
```

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/AppShell.tsx
git commit -m "feat: add Data Insight mobile tab for admin"
```

---

### Task 9: Build verification

- [ ] **Step 1: Run the build**

```bash
npm run build
```

Expected: No errors. The build should complete successfully.

- [ ] **Step 2: If build fails, fix and rebuild**

Check error output and fix TypeScript / import issues.

- [ ] **Step 3: Manual review checklist**
- [ ] `/api/data-insight` route handles empty filter case (no params → district-level aggregation)
- [ ] Drill-down logic is correct: no filter → district, district → tehsil, +tehsil → uc, +uc → unit
- [ ] KPI cards show correct 0/empty state when no data
- [ ] Table shows correct columns based on aggregation level
- [ ] Pagination works — prev/next disabled at boundaries
- [ ] Page size selector resets to page 1
- [ ] Nav item only shows for admin users (role === 'admin')
- [ ] Mobile tab only shows for admin users
- [ ] Filters cascade correctly (changing district resets tehsil/uc)
