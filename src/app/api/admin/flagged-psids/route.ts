import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const FLAGGED_COLS = 'id, psid, survey_id, reason, notes, flagged_by, flagged_at, bill_month, city_district, tehsil, resolved_at, resolution'

const ALLOWED_REASONS = [
  'field_deleted',
  'portal_deleted',
  'psid_duplicate_orphan',
  'psid_duplicate_superseded',
  'psid_duplicate_monthly',
  'staff_flagged',
  'admin_flagged',
] as const

async function fetchStats(sup: any) {
  const counts = await Promise.all(
    ALLOWED_REASONS.map(async (reason) => {
      const { count } = await sup
        .from('flagged_psids')
        .select('*', { count: 'exact', head: true })
        .is('resolved_at', null)
        .eq('reason', reason)
      return { reason, count: count ?? 0 }
    })
  )

  const { data: cities } = await sup
    .from('flagged_psids')
    .select('city_district')
    .not('city_district', 'is', null)
    .order('city_district')

  const uniqueCities = [...new Set((cities || []).map((c: { city_district: string }) => c.city_district))]

  const { count: totalUnresolved } = await sup
    .from('flagged_psids')
    .select('*', { count: 'exact', head: true })
    .is('resolved_at', null)

  return {
    byReason: counts,
    totalUnresolved: totalUnresolved ?? 0,
    cities: uniqueCities,
  }
}

export async function GET(request: Request) {
  try {
    const sp = new URL(request.url).searchParams
    const isStats = sp.get('stats') === 'true'

    const sup = await createClient()

    if (isStats) {
      return NextResponse.json(await fetchStats(sup))
    }

    const page = Math.max(1, parseInt(sp.get('page') || '1', 10))
    const pageSize = Math.min(100, Math.max(1, parseInt(sp.get('pageSize') || '25', 10)))
    const reason = sp.get('reason')?.trim()
    const city = sp.get('city')?.trim()
    const tehsil = sp.get('tehsil')?.trim()
    const dateFrom = sp.get('dateFrom')?.trim()
    const dateTo = sp.get('dateTo')?.trim()
    const unresolvedOnly = sp.get('unresolvedOnly') !== 'false'
    const search = sp.get('search')?.trim()

    if (reason && !ALLOWED_REASONS.includes(reason as typeof ALLOWED_REASONS[number])) {
      return NextResponse.json({ error: `Invalid reason. Allowed: ${ALLOWED_REASONS.join(', ')}` }, { status: 400 })
    }

    let query = sup
      .from('flagged_psids')
      .select(FLAGGED_COLS, { count: 'exact' })

    if (unresolvedOnly) {
      query = query.is('resolved_at', null)
    }

    if (reason) {
      query = query.eq('reason', reason)
    }

    if (city) {
      query = query.eq('city_district', city)
    }

    if (tehsil) {
      query = query.eq('tehsil', tehsil)
    }

    if (dateFrom) {
      query = query.gte('flagged_at', dateFrom)
    }

    if (dateTo) {
      query = query.lte('flagged_at', dateTo)
    }

    if (search) {
      query = query.or(`psid.ilike.%${search}%,survey_id.ilike.%${search}%,notes.ilike.%${search}%`)
    }

    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    const { data, error, count } = await query
      .order('flagged_at', { ascending: false })
      .range(from, to)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      data: data || [],
      total: count ?? 0,
      page,
      pageSize,
    })
  } catch (err) {
    console.error('admin/flagged-psids route error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { psid, survey_id, reason, notes } = body as {
      psid: string
      survey_id?: string | null
      reason: string
      notes?: string | null
    }

    if (!psid || !reason) {
      return NextResponse.json({ error: 'psid and reason required' }, { status: 400 })
    }

    if (!ALLOWED_REASONS.includes(reason as typeof ALLOWED_REASONS[number])) {
      return NextResponse.json({ error: `Invalid reason. Allowed: ${ALLOWED_REASONS.join(', ')}` }, { status: 400 })
    }

    const sup = await createClient()

    const { data, error } = await sup
      .from('flagged_psids')
      .insert({
        psid,
        survey_id: survey_id || null,
        reason,
        notes: notes || null,
        flagged_at: new Date().toISOString(),
      })
      .select(FLAGGED_COLS)
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Also get the current user to set flagged_by if possible
    const { data: { user: authUser } } = await sup.auth.getUser()
    if (authUser?.id && data) {
      await sup.from('flagged_psids').update({ flagged_by: authUser.id }).eq('id', data.id)
    }

    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    console.error('admin/flagged-psids POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
