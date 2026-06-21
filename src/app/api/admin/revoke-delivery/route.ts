import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function checkAdmin() {
  const sup = await createClient()
  const { data: { user } } = await sup.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const { data: profile } = await sup
    .from('profiles')
    .select('roles!inner(name)')
    .eq('id', user.id)
    .single()

  const role = profile?.roles as { name: string } | undefined
  if (!role || (role.name !== 'admin' && role.name !== 'super_admin')) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { user }
}

export async function GET(req: NextRequest) {
  const { error } = await checkAdmin()
  if (error) return error

  const { searchParams } = new URL(req.url)
  const ucName = searchParams.get('uc_name')
  const q = searchParams.get('q')
  const status = searchParams.get('status')
  const dateFrom = searchParams.get('date_from')
  const dateTo = searchParams.get('date_to')
  const staffId = searchParams.get('staff_id')
  const grouped = searchParams.has('grouped')

  try {
    const sup = await createClient()

    // 1. Fetch assignment_items with assignment + staff data
    let query = sup
      .from('assignment_items')
      .select(`
        id, psid, status, started_at, delivered_at, gps_lat, gps_lng,
        daily_assignments!inner(uc_name, staff_id, staff:staff_id(id, full_name))
      `)

    if (status) {
      query = query.eq('status', status)
    } else {
      query = query.in('status', ['delivered', 'processing'])
    }

    if (ucName) {
      query = query.eq('daily_assignments.uc_name', ucName)
    }

    if (staffId) {
      query = query.eq('daily_assignments.staff_id', staffId)
    }

    if (dateFrom) {
      query = query.gte('delivered_at', dateFrom)
    }

    if (dateTo) {
      query = query.lte('delivered_at', dateTo)
    }

    const { data: itemsData, error: fetchErr } = await query
      .order('delivered_at', { ascending: false })
      .limit(500)

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 })
    }

    if (!itemsData?.length) {
      return NextResponse.json(grouped ? { grouped: {}, total: 0 } : { items: [], total: 0 })
    }

    // Grouped mode — return simple format for RevokeDeliverySection
    if (grouped) {
      const result: Record<string, any[]> = {}
      for (const r of itemsData as any[]) {
        const uc = r.daily_assignments.uc_name
        if (!result[uc]) result[uc] = []
        result[uc].push({
          id: r.id,
          psid: r.psid,
          status: r.status,
          started_at: r.started_at,
          delivered_at: r.delivered_at,
          gps_lat: r.gps_lat,
          gps_lng: r.gps_lng,
          uc_name: uc,
          staff_name: r.daily_assignments.staff?.full_name || 'Unknown',
          staff_id: r.daily_assignments.staff_id,
        })
      }
      return NextResponse.json({ grouped: result, total: itemsData.length })
    }

    // Full mode — batch-fetch survey_units + delivery_photos joins
    const psids = [...new Set(itemsData.map((r: any) => r.psid).filter(Boolean))]
    const { data: units } = await sup
      .from('survey_units')
      .select('psid, survey_id, consumer_name, address, lat, lng')
      .in('psid', psids)

    const unitMap = new Map((units || []).map((u: any) => [u.psid, u]))

    const itemIds = itemsData.map((r: any) => r.id)

    // Batch-fetch flagged_psids (unresolved only)
    const { data: flaggedEntries } = await sup
      .from('flagged_psids')
      .select('psid, reason')
      .in('psid', psids)
      .is('resolved_at', null)
    const flaggedMap = new Map<string, string>()
    for (const f of (flaggedEntries || []) as any[]) {
      if (!flaggedMap.has(f.psid)) {
        flaggedMap.set(f.psid, f.reason)
      }
    }

    const { data: photos } = await sup
      .from('delivery_photos')
      .select('id, assignment_item_id, photo_url, captured_at')
      .in('assignment_item_id', itemIds)
      .order('captured_at', { ascending: false })

    const photoMap = new Map<string, { photo_url: string | null; captured_at: string | null }>()
    for (const p of (photos || []) as any[]) {
      if (!photoMap.has(p.assignment_item_id)) {
        photoMap.set(p.assignment_item_id, {
          photo_url: p.photo_url,
          captured_at: p.captured_at,
        })
      }
    }

    let items = itemsData.map((r: any) => {
      const unit = unitMap.get(r.psid) || {}
      const photo = photoMap.get(r.id)
      return {
        id: r.id,
        psid: r.psid,
        survey_id: unit.survey_id || null,
        consumer_name: unit.consumer_name || null,
        address: unit.address || null,
        portal_lat: unit.lat ?? null,
        portal_lng: unit.lng ?? null,
        status: r.status,
        started_at: r.started_at,
        delivered_at: r.delivered_at,
        gps_lat: r.gps_lat,
        gps_lng: r.gps_lng,
        photo_url: photo?.photo_url || null,
        photo_captured_at: photo?.captured_at || null,
        uc_name: r.daily_assignments.uc_name,
        staff_name: r.daily_assignments.staff?.full_name || 'Unknown',
        staff_id: r.daily_assignments.staff_id,
        flagged_reason: flaggedMap.get(r.psid) || null,
      }
    })

    if (q) {
      const lower = q.toLowerCase()
      items = items.filter(
        (i) =>
          i.psid?.toLowerCase().includes(lower) ||
          i.consumer_name?.toLowerCase().includes(lower) ||
          i.survey_id?.toLowerCase().includes(lower),
      )
    }

    return NextResponse.json({ items, total: items.length })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const { error } = await checkAdmin()
  if (error) return error

  const body = await req.json()
  const { assignment_item_id, uc_name, item_ids } = body

  if (!assignment_item_id && !uc_name && !item_ids?.length) {
    return NextResponse.json({ error: 'Provide assignment_item_id, uc_name, or item_ids' }, { status: 400 })
  }

  try {
    const admin = createAdminClient()

    let itemIds: string[] = []

    if (item_ids?.length) {
      itemIds = item_ids
    } else if (assignment_item_id) {
      itemIds = [assignment_item_id]
    } else if (uc_name) {
      const { data: items } = await (admin.from('assignment_items') as any)
        .select('id, daily_assignments!inner(uc_name)')
        .in('status', ['delivered', 'processing'])
        .eq('daily_assignments.uc_name', uc_name)
      itemIds = (items || []).map((r: any) => r.id)
    }

    if (itemIds.length === 0) {
      return NextResponse.json({ revoked: 0 })
    }

    await (admin.from('delivery_photos') as any)
      .delete()
      .in('assignment_item_id', itemIds)

    await (admin.from('assignment_items') as any)
      .update({
        status: 'pending',
        started_at: null,
        delivered_at: null,
        gps_lat: null,
        gps_lng: null,
        notes: null,
      })
      .in('id', itemIds)

    return NextResponse.json({ revoked: itemIds.length, itemIds })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
