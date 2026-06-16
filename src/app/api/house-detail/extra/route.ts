import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getFlaggedEntriesBySurvey } from '@/lib/repositories/flagged-psids-repository'
import { currentMonth, MONTHS } from '@/lib/constants'
import { join } from 'path'
import { readFileSync } from 'fs'

function monthKey(m: string): number {
  const re = m.match(/^([A-Z]{3})(\d{4})$/)
  if (!re) return 0
  return parseInt(re[2]) * 12 + MONTHS.indexOf(re[1])
}

function generateMonthRange(from: string, to: string): string[] {
  const parse = (s: string) => {
    const match = s.match(/^([A-Z]{3})(\d{4})$/)
    if (!match) return null
    const monthIdx = MONTHS.indexOf(match[1].toUpperCase())
    if (monthIdx === -1) return null
    return { year: parseInt(match[2]), month: monthIdx }
  }
  const f = parse(from)
  const t = parse(to)
  if (!f || !t) return []
  const result: string[] = []
  let cur = { year: f.year, month: f.month }
  while (cur.year < t.year || (cur.year === t.year && cur.month <= t.month)) {
    result.push(`${MONTHS[cur.month]}${cur.year}`)
    cur.month++
    if (cur.month > 11) { cur.month = 0; cur.year++ }
  }
  return result
}

export async function GET(request: Request) {
  const sup = await createClient()
  const { data: { user } } = await sup.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = new URL(request.url).searchParams
  const surveyId = sp.get('survey_id')
  const psid = sp.get('psid')

  if (!surveyId) return NextResponse.json({ error: 'survey_id required' }, { status: 400 })

  const sep2025 = 'SEP2025'

  const [surveyUnitResult, paymentsResult, billInfoResult, deliveryPhotosResult, flaggedResult] = await Promise.all([
    // Survey unit data
    (async () => {
      try {
        const { data } = await sup.from('survey_units')
          .select('survey_id, consumer_name, address, lat, lng, city_district, tehsil, uc_name, surveyor_name, survey_date, survey_time, monthly_fee, billing_category, status, psid, arrears, route_name, route_seq, current_bill_month, image_urls')
          .eq('survey_id', surveyId)
          .single()
        return data
      } catch { return null }
    })(),

    // Payments
    (async () => {
      try {
        let payments: any[] = []
        let bill: any = null
        let allMonths: string[] = []
        const { data: su } = await sup.from('survey_units').select('psid').eq('survey_id', surveyId).single()
        const psids = su?.psid ? [su.psid] : []

        const billsPath = join(process.cwd(), 'public', 'data', 'bills.json')
        let bills: any[] = []
        try { bills = JSON.parse(readFileSync(billsPath, 'utf-8')) } catch {}

        const months = (() => {
          const now = new Date(); const r: string[] = []
          for (let i = 0; i < 3; i++) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); r.push(`${MONTHS[d.getMonth()]}${d.getFullYear()}`) }
          return r
        })()
        const matchingBills = bills.filter((b: any) => b.survey_id === surveyId && months.includes(b.bill_month))
        const current = currentMonth()
        bill = matchingBills.find((b: any) => b.bill_month === current) || null

        const { data: rawPayments } = await sup.from('payment_history').select('psid, bill_month, amount_paid, paid_date, payment_method, payment_status').in('psid', psids)
        payments = [...(rawPayments || [])].sort((a, b) => monthKey(b.bill_month) - monthKey(a.bill_month))

        const oldestPayment = payments.length ? payments[payments.length - 1].bill_month : null
        const lookback = (() => { const d = new Date(); d.setMonth(d.getMonth() - 23); return `${MONTHS[d.getMonth()]}${d.getFullYear()}` })()
        const earliestRaw = oldestPayment && monthKey(oldestPayment) < monthKey(lookback) ? oldestPayment : lookback
        const earliestMonth = monthKey(earliestRaw) < monthKey(sep2025) ? sep2025 : earliestRaw
        allMonths = generateMonthRange(earliestMonth, currentMonth())

        return { bill, payments, allMonths }
      } catch { return null }
    })(),

    // Bill info
    (async () => {
      try {
        const { data: survey } = await sup.from('survey_units').select('survey_id, uc_name, route_name, route_seq, psid, start_month, current_bill_month').eq('survey_id', surveyId).single()
        if (!survey) return null

        let billNumber: number | null = null
        let billTotal: number | null = null
        if (survey.uc_name && survey.route_seq != null) {
          const { count: total } = await sup.from('survey_units').select('*', { count: 'exact', head: true }).eq('uc_name', survey.uc_name).not('route_seq', 'is', null)
          billTotal = total ?? null

          const { count: before } = await sup.from('survey_units').select('*', { count: 'exact', head: true }).eq('uc_name', survey.uc_name).not('route_seq', 'is', null).or(`route_seq.lt.${survey.route_seq},and(route_seq.eq.${survey.route_seq},survey_id.gt.${survey.survey_id})`)
          if (before != null) billNumber = before + 1
        }

        let paidMonths = 0
        if (survey.psid) {
          const { count } = await sup.from('payment_history').select('*', { count: 'exact', head: true }).eq('psid', survey.psid).eq('payment_status', 'paid')
          paidMonths = count ?? 0
        }

        return { billNumber, billTotal, routeName: survey.route_name, routeSeq: survey.route_seq, ucName: survey.uc_name, paidMonths, startMonth: survey.start_month, currentBillMonth: survey.current_bill_month }
      } catch { return null }
    })(),

    // Delivery photos
    (async () => {
      try {
        if (!psid) return []
        const { data: items } = await sup.from('assignment_items').select('id').eq('psid', psid)
        const itemIds = (items || []).map((i: any) => i.id)
        if (!itemIds.length) return []
        const { data } = await sup.from('delivery_photos').select('id, assignment_item_id, photo_url, gdrive_file_id, gps_lat, gps_lng, captured_at, synced_to_drive').in('assignment_item_id', itemIds).order('captured_at', { ascending: false })
        return data || []
      } catch { return [] }
    })(),

    // Flagged psids
    (async () => {
      try {
        const resp = await getFlaggedEntriesBySurvey(sup, surveyId, psid || undefined)
        return resp
      } catch { return { summary: null, entries: [] } }
    })(),
  ])

  return NextResponse.json({
    surveyData: surveyUnitResult,
    billData: paymentsResult,
    billInfo: billInfoResult,
    deliveryPhotos: deliveryPhotosResult,
    flaggedData: flaggedResult,
  })
}
