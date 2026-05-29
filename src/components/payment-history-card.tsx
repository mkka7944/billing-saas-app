'use client'

import { useState, useMemo } from 'react'
import { Badge } from '@/components/ui/badge'

interface PaymentRecord {
  psid: string
  bill_month: string
  amount_paid: number
  payment_status: string | null
}

interface PaymentHistoryCardProps {
  payments: PaymentRecord[]
  allMonths?: string[]
  currentMonthTag?: string
  maxPreview?: number
}

function parseBillMonth(m: string): string {
  const match = m.match(/^([A-Za-z]{3})(\d{4})$/)
  if (!match) return m
  const months: Record<string, string> = { JAN: 'Jan', FEB: 'Feb', MAR: 'Mar', APR: 'Apr', MAY: 'May', JUN: 'Jun', JUL: 'Jul', AUG: 'Aug', SEP: 'Sep', OCT: 'Oct', NOV: 'Nov', DEC: 'Dec' }
  return `${months[match[1].toUpperCase()] || match[1]} ${match[2]}`
}

export function PaymentHistoryCard({ payments, allMonths, currentMonthTag, maxPreview = 3 }: PaymentHistoryCardProps) {
  const [showAll, setShowAll] = useState(false)

  const merged = useMemo(() => {
    if (!allMonths || !allMonths.length) {
      const copy = [...payments]
      copy.sort((a, b) => a.bill_month.localeCompare(b.bill_month))
      return copy
    }
    const paymentMap = new Map<string, PaymentRecord>()
    for (const p of payments) {
      paymentMap.set(p.bill_month, p)
    }
    return allMonths.map((month) => {
      const existing = paymentMap.get(month)
      return existing || { psid: '', bill_month: month, amount_paid: 0, payment_status: null }
    })
  }, [payments, allMonths])

  const visible = showAll ? merged : merged.slice(-maxPreview)

  if (!merged.length) {
    return (
      <div className="flex items-center justify-center min-h-[40px]">
        <p className="text-[10px] text-muted-foreground/60 italic">No payments</p>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Payments</p>
      {visible.map((p, i) => (
        <div key={`${p.psid || 'empty'}-${p.bill_month || i}`} className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[10px] font-mono font-medium">{parseBillMonth(p.bill_month)}</span>
            {currentMonthTag === p.bill_month && (
              <span className="text-[8px] font-extrabold uppercase tracking-wider text-blue-600 bg-blue-100 rounded px-1 shrink-0">Current</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] font-bold">Rs.{Number(p.amount_paid || 0).toLocaleString()}</span>
            <Badge variant={p.payment_status?.toLowerCase() === 'paid' ? 'default' : 'secondary'} className="text-[8px] h-3.5 px-1">
              {p.payment_status === 'paid' ? '✓' : '—'}
            </Badge>
          </div>
        </div>
      ))}
      {merged.length > maxPreview && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 transition-colors cursor-pointer"
        >
          {showAll ? 'Show Less' : `View All (${merged.length - maxPreview} more)`}
        </button>
      )}
    </div>
  )
}
