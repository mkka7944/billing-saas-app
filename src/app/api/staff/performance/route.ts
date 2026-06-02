import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const PERF_COLS = 'id, staff_id, assigned_date, rating, notes, created_by, created_at, updated_at'

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams
  const staffId = sp.get('staff_id') || ''
  const fromDate = sp.get('from') || ''
  const toDate = sp.get('to') || ''

  const sup = await createClient()
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
  const body = await request.json()
  const { staff_id, assigned_date, rating, notes } = body

  if (!staff_id || !assigned_date) {
    return NextResponse.json({ error: 'staff_id and assigned_date are required' }, { status: 400 })
  }

  // Get current user from session
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
