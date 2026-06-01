import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ survey_id: string }> }
) {
  const { survey_id } = await params
  const sup = await createClient()

  // Get survey unit
  const { data: survey } = await sup
    .from('survey_units')
    .select('survey_id, uc_name, route_name, route_seq, psid, start_month, current_bill_month')
    .eq('survey_id', survey_id)
    .single()

  if (!survey) {
    return NextResponse.json({ error: 'Survey not found' }, { status: 404 })
  }

  // Compute bill number within UC
  let billNumber: number | null = null
  let billTotal: number | null = null

  if (survey.uc_name && survey.route_seq != null) {
    const { data: ucSurveys } = await sup
      .from('survey_units')
      .select('survey_id, route_seq')
      .eq('uc_name', survey.uc_name)
      .not('route_seq', 'is', null)
      .order('route_seq', { ascending: true })
      .order('survey_id', { ascending: false })

    if (ucSurveys) {
      billTotal = ucSurveys.length
      const idx = ucSurveys.findIndex((s) => s.survey_id === survey_id)
      if (idx !== -1) billNumber = idx + 1
    }
  }

  // Count paid months for this survey's PSID
  let paidMonths = 0
  if (survey.psid) {
    const { count } = await sup
      .from('payment_history')
      .select('*', { count: 'exact', head: true })
      .eq('psid', survey.psid)
      .eq('payment_status', 'paid')

    paidMonths = count ?? 0
  }

  return NextResponse.json({
    billNumber,
    billTotal,
    routeName: survey.route_name,
    routeSeq: survey.route_seq,
    ucName: survey.uc_name,
    paidMonths,
    startMonth: survey.start_month,
    currentBillMonth: survey.current_bill_month,
  })
}
