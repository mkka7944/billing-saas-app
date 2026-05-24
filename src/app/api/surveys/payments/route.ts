import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function currentMonth(): string {
  const m = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
  const d = new Date()
  return `${m[d.getMonth()]}${d.getFullYear()}`
}

function last3Months(): string[] {
  const m = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
  const now = new Date()
  const result: string[] = []
  for (let i = 0; i < 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    result.push(`${m[d.getMonth()]}${d.getFullYear()}`)
  }
  return result
}

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams
  const surveyId = sp.get('surveyId')
  if (!surveyId) return NextResponse.json({ error: 'surveyId required' }, { status: 400 })

  const sup = await createClient()
  const months = last3Months()

  const { data: items } = await sup
    .from('bill_items')
    .select('psid, bill_month, amount_due, arrears, monthly_fee, amount_paid, payment_status')
    .eq('survey_id', surveyId)
    .in('bill_month', months)

  const current = currentMonth()
  const bill = items?.find((i: any) => i.bill_month === current) || null
  const psids = [...new Set((items || []).map((i: any) => i.psid))]

  const { data: payments } = await sup
    .from('payment_history')
    .select('psid, bill_month, amount_paid, paid_date, payment_method, payment_status')
    .in('psid', psids)
    .order('bill_month', { ascending: false })

  return NextResponse.json({ bill, payments: payments || [] })
}
