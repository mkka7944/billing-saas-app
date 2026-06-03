import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validateQuery } from '@/lib/validation/validate-query'
import { flaggedPsidsQuerySchema } from '@/lib/validation/schemas'
import { fetchFlaggedPsidsStats, getFlaggedPsids, createFlaggedEntry } from '@/lib/repositories/flagged-psids-repository'

export async function GET(request: Request) {
  try {
    const sup = await createClient()

    if (new URL(request.url).searchParams.get('stats') === 'true') {
      return NextResponse.json(await fetchFlaggedPsidsStats(sup))
    }

    const params = validateQuery(request, flaggedPsidsQuerySchema)
    if (params instanceof NextResponse) return params

    const result = await getFlaggedPsids(sup, {
      page: params.page,
      pageSize: params.pageSize,
      reason: params.reason?.trim(),
      city: params.city?.trim(),
      tehsil: params.tehsil?.trim(),
      dateFrom: params.dateFrom?.trim(),
      dateTo: params.dateTo?.trim(),
      unresolvedOnly: params.unresolvedOnly,
      search: params.search?.trim(),
    })

    if ('error' in result) {
      const status = (result as any).status || 400
      return NextResponse.json({ error: result.error }, { status })
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error('admin/flagged-psids route error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const sup = await createClient()
    const result = await createFlaggedEntry(sup, {
      psid: body.psid,
      survey_id: body.survey_id,
      reason: body.reason,
      notes: body.notes,
    })

    if ('error' in result) {
      const status = (result as any).status || 400
      return NextResponse.json({ error: result.error }, { status })
    }

    return NextResponse.json({ data: result.data }, { status: 201 })
  } catch (err) {
    console.error('admin/flagged-psids POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
