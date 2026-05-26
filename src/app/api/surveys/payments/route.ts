import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { currentMonth } from '@/lib/constants'
import { join } from 'path'
import { readFileSync } from 'fs'

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
    .order('bill_month', { ascending: false })

  return NextResponse.json({ bill, payments: payments || [] })
}
