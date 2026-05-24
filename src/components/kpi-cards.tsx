'use client'

import { useBillingStats } from '@/hooks/use-billing-stats'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Users, Receipt, PiggyBank, Target } from 'lucide-react'

export function KpiCards() {
  const { data, isLoading } = useBillingStats()

  if (isLoading) {
    return (
      <div className="p-4 space-y-4 overflow-y-auto">
        <Skeleton className="h-5 w-24" />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
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
      </div>
    )
  }

  const stats = data?.grand_totals

  const cards = [
    {
      title: 'Total Units',
      value: stats?.total_units || 0,
      icon: Users,
      color: 'text-blue-600',
      bg: 'bg-blue-100',
    },
    {
      title: 'Paying Units',
      value: stats?.total_paying || 0,
      icon: Receipt,
      color: 'text-green-600',
      bg: 'bg-green-100',
    },
    {
      title: 'Collected',
      value: `Rs. ${(stats?.total_collected || 0).toLocaleString()}`,
      icon: PiggyBank,
      color: 'text-emerald-600',
      bg: 'bg-emerald-100',
    },
    {
      title: 'Recovery Rate',
      value: `${stats?.recovery_rate || 0}%`,
      icon: Target,
      color: 'text-purple-600',
      bg: 'bg-purple-100',
    },
  ]

  return (
    <div className="p-3 space-y-3 overflow-y-auto">
      <h2 className="text-sm font-semibold">Dashboard</h2>
      <div className="grid grid-cols-2 gap-3">
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
    </div>
  )
}
