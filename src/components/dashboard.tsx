'use client'

import { useState } from 'react'
import { useBillingCharts } from '@/hooks/use-billing-charts'
import { currentMonth } from '@/lib/constants'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Users, Receipt, PiggyBank, FileSpreadsheet, AlertCircle } from 'lucide-react'
import { MonthlyTrendChart } from '@/components/charts/monthly-trend'
import { CategoryBreakdownChart } from '@/components/charts/category-breakdown'
import { MonthlyCurvesChart } from '@/components/charts/monthly-curves'
import { OfficeBreakdownChart } from '@/components/charts/office-breakdown'
import { OrphanPsidTable } from '@/components/orphan-psid-table'
import { cn } from '@/lib/utils'

type TabId = 'overview' | 'monthly' | 'offices' | 'orphans'

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'monthly', label: 'Monthly Performance' },
  { id: 'offices', label: 'Office Breakdown' },
  { id: 'orphans', label: 'Orphans' },
]

function formatRs(n: number) {
  return `Rs. ${n.toLocaleString()}`
}

function KpiSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-7 rounded" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-7 w-24" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function ChartSkeleton({ height = 250 }: { height?: number }) {
  return (
    <div className="rounded-lg border bg-card p-4" style={{ height }}>
      <Skeleton className="h-full w-full" />
    </div>
  )
}

function ErrorCard({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-8 text-center">
        <AlertCircle className="h-8 w-8 text-red-500 mb-2" />
        <p className="text-sm text-muted-foreground mb-2">{message}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="text-xs font-semibold text-primary hover:underline cursor-pointer"
          >
            Try again
          </button>
        )}
      </CardContent>
    </Card>
  )
}

export function Dashboard() {
  const [activeTab, setActiveTab] = useState<TabId>('overview')

  const { data: chartsData, isLoading, isError, refetch } = useBillingCharts()

  const mt = chartsData?.monthly_trend || []
  const current = mt.find((t) => t.bill_month === currentMonth())
  const currentBills = current?.bills || 0
  const currentFines = current?.fine_total || 0
  const collected = chartsData?.kpi?.collected || 0
  const totalUnits = chartsData?.kpi?.total_units || 0

  if (isLoading) {
    return (
      <div className="p-4 space-y-4 overflow-y-auto">
        <KpiSkeleton />
        <div className="space-y-3">
          <ChartSkeleton height={250} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <ChartSkeleton height={250} />
            <ChartSkeleton height={250} />
          </div>
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="p-4 space-y-4 overflow-y-auto">
        <ErrorCard message="Failed to load dashboard data" onRetry={() => refetch()} />
      </div>
    )
  }

  const cards = [
    {
      title: 'Total Paying Units',
      value: totalUnits.toLocaleString(),
      icon: Users,
      color: 'text-blue-600 dark:text-blue-300',
      bg: 'bg-blue-100 dark:bg-blue-900/30',
    },
    {
      title: 'Bills Current Month',
      value: currentBills.toLocaleString(),
      icon: FileSpreadsheet,
      color: 'text-green-600 dark:text-green-300',
      bg: 'bg-green-100 dark:bg-green-900/30',
    },
    {
      title: 'Total Collected',
      value: `Rs. ${collected.toLocaleString()}`,
      icon: PiggyBank,
      color: 'text-emerald-600 dark:text-emerald-300',
      bg: 'bg-emerald-100 dark:bg-emerald-900/30',
    },
    {
      title: 'Fines Collected',
      value: `Rs. ${currentFines.toLocaleString()}`,
      icon: AlertCircle,
      color: 'text-red-600 dark:text-red-300',
      bg: 'bg-red-100 dark:bg-red-900/30',
    },
    {
      title: 'Monthly Bills',
      value: mt.reduce((s, m) => s + m.bills, 0).toLocaleString(),
      icon: Receipt,
      color: 'text-amber-600 dark:text-amber-300',
      bg: 'bg-amber-100 dark:bg-amber-900/30',
    },
    {
      title: 'Collection Days',
      value: (chartsData?.daily_detail?.length || 0).toLocaleString(),
      icon: PiggyBank,
      color: 'text-purple-600 dark:text-purple-300',
      bg: 'bg-purple-100 dark:bg-purple-900/30',
    },
  ]

  return (
    <div className="h-full overflow-y-auto overflow-x-auto min-w-0">
      <div className="p-4 space-y-4">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {cards.map((card) => (
            <Card key={card.title}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs text-muted-foreground font-medium">{card.title}</CardTitle>
                <div className={`p-1.5 rounded ${card.bg}`}>
                  <card.icon className={`h-4 w-4 ${card.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-xl font-bold">{card.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Tab Bar */}
        <div className="flex gap-1 border-b pb-0 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'px-4 py-2 text-xs font-bold border-b-2 transition-colors cursor-pointer min-h-[36px]',
                activeTab === tab.id
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="space-y-4">
            <div className="rounded-lg border bg-card p-4">
              <MonthlyTrendChart data={chartsData?.monthly_trend || []} title="Monthly Collection Trend" />
            </div>
            <div className="rounded-lg border bg-card p-4">
              <CategoryBreakdownChart data={chartsData?.category_summary || []} title="Billing Category Split" />
            </div>
          </div>
        )}

        {activeTab === 'monthly' && (
          <div className="rounded-lg border bg-card p-4">
            <MonthlyCurvesChart data={chartsData?.monthly_curves || []} title="Daily Collection Comparison" />
            <p className="mt-2 text-[10px] text-muted-foreground text-right">Click legend to toggle months</p>
          </div>
        )}

        {activeTab === 'offices' && (
          <div className="rounded-lg border bg-card p-4">
            <OfficeBreakdownChart data={chartsData?.tehsil_breakdown || []} title="Tehsil Office × Month Collection" />
          </div>
        )}

        {activeTab === 'orphans' && (
          <div className="rounded-lg border bg-card p-4">
            <OrphanPsidTable />
          </div>
        )}
      </div>
    </div>
  )
}
