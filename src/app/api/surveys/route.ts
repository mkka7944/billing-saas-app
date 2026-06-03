import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { currentMonth } from '@/lib/constants'
import { validateQuery } from '@/lib/validation/validate-query'
import { surveyQuerySchema } from '@/lib/validation/schemas'
import { getSurveyById, getSurveys } from '@/lib/repositories/survey-repository'

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams
  const id = sp.get('id')
  const sup = await createClient()

  if (id) {
    const result = await getSurveyById(sup, id)
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: 500 })
    return NextResponse.json(result)
  }

  const params = validateQuery(request, surveyQuerySchema)
  if (params instanceof NextResponse) return params

  const sort = { field: params.sortField, ascending: params.sortDirection === 'asc' }

  const result = await getSurveys(sup, {
    districts: params.district,
    tehsils: params.tehsil,
    ucs: params.uc,
    surveyor: params.surveyor,
    search: params.search,
    paymentStatus: params.paymentStatus,
    billMonth: params.billMonth || currentMonth(),
    page: params.page,
    pageSize: params.pageSize,
    sort,
  })

  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 500 })
  return NextResponse.json(result)
}
