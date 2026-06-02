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

const ALLOWED_RESOLUTIONS = ['confirmed_duplicate', 'confirmed_valid', 'ignored'] as const

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { resolved, notes, reason, resolution } = body as {
      resolved?: boolean
      notes?: string | null
      reason?: string
      resolution?: string
    }

    if (!id) {
      return NextResponse.json({ error: 'id param required' }, { status: 400 })
    }

    const sup = await createClient()

    const update: Record<string, unknown> = {}

    if (resolved === true) {
      update.resolved_at = new Date().toISOString()
    }

    if (notes !== undefined) {
      update.notes = notes
    }

    if (reason) {
      if (!ALLOWED_REASONS.includes(reason as typeof ALLOWED_REASONS[number])) {
        return NextResponse.json({ error: `Invalid reason. Allowed: ${ALLOWED_REASONS.join(', ')}` }, { status: 400 })
      }
      update.reason = reason
    }

    if (resolution) {
      if (!ALLOWED_RESOLUTIONS.includes(resolution as typeof ALLOWED_RESOLUTIONS[number])) {
        return NextResponse.json({ error: `Invalid resolution. Allowed: ${ALLOWED_RESOLUTIONS.join(', ')}` }, { status: 400 })
      }
      update.resolution = resolution
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    const { data, error } = await sup
      .from('flagged_psids')
      .update(update)
      .eq('id', id)
      .select(FLAGGED_COLS)
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('admin/flagged-psids PATCH error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
