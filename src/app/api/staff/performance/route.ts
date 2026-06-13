import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const PERF_COLS = 'id, staff_id, assigned_date, rating, notes, created_by, created_at, updated_at'

async function requireAdmin(sup: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user }, error: authError } = await sup.auth.getUser()
  if (!user || authError) return 'Unauthorized'
  const { data: profile } = await sup
    .from('profiles')
    .select('roles!inner(name)')
    .eq('id', user.id)
    .single()
  const role = profile?.roles as { name: string } | undefined
  if (!role || (role.name !== 'admin' && role.name !== 'super_admin')) return 'Forbidden: admin required'
  return null
}

export async function GET(request: Request) {
  const sup = await createClient()

  const { data: { user }, error: authError } = await sup.auth.getUser()
  if (!user || authError) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sp = new URL(request.url).searchParams
  const staffId = sp.get('staff_id') || ''
  const fromDate = sp.get('from') || ''
  const toDate = sp.get('to') || ''

  let q = sup
    .from('staff_performance')
    .select('id, staff_id, assigned_date, rating, notes, created_by, created_at, updated_at')
    .order('assigned_date', { ascending: false })

  if (staffId) q = q.eq('staff_id', staffId)
  if (fromDate) q = q.gte('assigned_date', fromDate)
  if (toDate) q = q.lte('assigned_date', toDate)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data || [] })
}

export async function POST(request: Request) {
  const sup = await createClient()
  const err = await requireAdmin(sup)
  if (err) return NextResponse.json({ error: err }, { status: err === 'Unauthorized' ? 401 : 403 })

  const body = await request.json()
  const { staff_id, assigned_date, rating, notes } = body

  if (!staff_id || !assigned_date) {
    return NextResponse.json({ error: 'staff_id and assigned_date are required' }, { status: 400 })
  }

  const { data: { user } } = await sup.auth.getUser()
  const created_by = user?.id

  const upsertData: Record<string, unknown> = { staff_id, assigned_date }
  if (rating !== undefined) upsertData.rating = rating
  if (notes !== undefined) upsertData.notes = notes
  if (created_by) upsertData.created_by = created_by
  upsertData.updated_at = new Date().toISOString()

  const { data, error } = await sup
    .from('staff_performance')
    .upsert(upsertData, { onConflict: 'staff_id, assigned_date' })
    .select(PERF_COLS)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
