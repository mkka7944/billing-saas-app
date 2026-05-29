import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { currentMonth } from '@/lib/constants'
import { join } from 'path'
import { readFileSync } from 'fs'

function generateMonthRange(from: string, to: string): string[] {
  const m = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
  const parse = (s: string) => {
    const match = s.match(/^([A-Z]{3})(\d{4})$/)
    if (!match) return null
    const monthIdx = m.indexOf(match[1].toUpperCase())
    if (monthIdx === -1) return null
    return { year: parseInt(match[2]), month: monthIdx }
  }
  const f = parse(from)
  const t = parse(to)
  if (!f || !t) return []
  const result: string[] = []
  let cur = { year: f.year, month: f.month }
  while (cur.year < t.year || (cur.year === t.year && cur.month <= t.month)) {
    result.push(`${m[cur.month]}${cur.year}`)
    cur.month++
    if (cur.month > 11) { cur.month = 0; cur.year++ }
  }
  return result
}

function monthKey(m: string): number {
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
  const re = m.match(/^([A-Z]{3})(\d{4})$/)
  if (!re) return 0
  return parseInt(re[2]) * 12 + months.indexOf(re[1])
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

  // Get psid(s) for this survey from survey_units
  const { data: su } = await sup
    .from('survey_units')
    .select('psid')
    .eq('survey_id', surveyId)
    .single()

  const psids = su?.psid ? [su.psid] : []

  // Read bills from JSON
  const billsPath = join(process.cwd(), 'public', 'data', 'bills.json')
  let bills: any[] = []
  try {
    bills = JSON.parse(readFileSync(billsPath, 'utf-8'))
  } catch {}

  const months = last3Months()
  const matchingBills = bills.filter((b: any) => b.survey_id === surveyId && months.includes(b.bill_month))

  const current = currentMonth()
  const bill = matchingBills.find((b: any) => b.bill_month === current) || null

  // Get payments for these psids
  const { data: payments } = await sup
    .from('payment_history')
    .select('psid, bill_month, amount_paid, paid_date, payment_method, payment_status')
    .in('psid', psids)

  // Sort chronologically (newest first) — Supabase alpha sort is wrong for "MMMYYYY"
  const sorted = [...(payments || [])].sort((a, b) => monthKey(b.bill_month) - monthKey(a.bill_month))

  // Generate contiguous month range from earliest possible month to current
  const oldestPayment = sorted.length ? sorted[sorted.length - 1].bill_month : null
  const lookback = (() => {
    const d = new Date()
    d.setMonth(d.getMonth() - 23)
    const m = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
    return `${m[d.getMonth()]}${d.getFullYear()}`
  })()
  const earliestMonth = oldestPayment && monthKey(oldestPayment) < monthKey(lookback) ? oldestPayment : lookback
  const allMonths = generateMonthRange(earliestMonth, currentMonth())

  return NextResponse.json({ bill, payments: sorted, allMonths })
}
