'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { FinanceSummary } from '@/types'

export function useBillingStats(month?: string) {
  const currentMonth = month || getCurrentBillMonth()

  return useQuery({
    queryKey: ['billing-stats', currentMonth],
    queryFn: async () => {
      const supabase = createClient()

      const { data: bills } = await supabase
        .from('bills')
        .select('bill_month, payment_status, amount_paid, amount_due, total_payable, survey_id, category')
        .eq('bill_month', currentMonth)

      const billList = (bills || []) as Array<{ payment_status: string | null; amount_paid: number | null; total_payable: number | null; amount_due: number | null }>

      if (!billList.length) {
        return {
          grand_totals: { total_units: 0, total_paying: 0, total_collected: 0, total_expected: 0, recovery_rate: 0 },
          tehsil_stats: [],
          uc_stats: [],
          category_stats: [],
        } satisfies FinanceSummary
      }

      const paid = billList.filter((b) => b.payment_status?.toLowerCase() === 'paid')
      const collected = paid.reduce((s, b) => s + Number(b.amount_paid || 0), 0)
      const expected = billList.reduce((s, b) => s + Number(b.total_payable || b.amount_due || 0), 0)

      return {
        grand_totals: {
          total_units: billList.length,
          total_paying: paid.length,
          total_collected: collected,
          total_expected: expected,
          recovery_rate: expected > 0 ? Math.round((collected / expected) * 10000) / 100 : 0,
        },
        tehsil_stats: [],
        uc_stats: [],
        category_stats: [],
      } satisfies FinanceSummary
    },
    staleTime: 5 * 60 * 1000,
  })
}

function getCurrentBillMonth(): string {
  const now = new Date()
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
  return `${months[now.getMonth()]}${now.getFullYear()}`
}
