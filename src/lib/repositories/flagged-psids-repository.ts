import type { SupabaseClient } from '@supabase/supabase-js'

const FLAGGED_COLS = 'id, psid, survey_id, reason, notes, flagged_by, flagged_at, bill_month, city_district, tehsil, resolved_at, resolution'

const ALLOWED_REASONS = [
  'field_deleted',
  'portal_deleted',
  'psid_duplicate_orphan',
  'psid_duplicate_superseded',
  'psid_duplicate_monthly',
  'staff_flagged',
  'admin_flagged',
  'unsent',
  'duplicate_psid',
  'duplicate_sid',
] as const

const ALLOWED_RESOLUTIONS = ['confirmed_duplicate', 'confirmed_valid', 'ignored'] as const

export interface FlaggedPsidsQuery {
  page: number
  pageSize: number
  reason?: string
  city?: string
  tehsil?: string
  dateFrom?: string
  dateTo?: string
  unresolvedOnly: boolean
  search?: string
}

export interface FlaggedPsidsStats {
  byReason: { reason: string; count: number }[]
  totalUnresolved: number
  cities: string[]
}

export async function fetchFlaggedPsidsStats(sup: SupabaseClient): Promise<FlaggedPsidsStats> {
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

export async function getFlaggedPsids(sup: SupabaseClient, q: FlaggedPsidsQuery) {
  let query = sup.from('flagged_psids').select(FLAGGED_COLS, { count: 'exact' })

  if (q.unresolvedOnly) query = query.is('resolved_at', null)
  if (q.reason) {
    if (!ALLOWED_REASONS.includes(q.reason as typeof ALLOWED_REASONS[number])) {
      return { error: `Invalid reason. Allowed: ${ALLOWED_REASONS.join(', ')}` }
    }
    query = query.eq('reason', q.reason)
  }
  if (q.city) query = query.eq('city_district', q.city)
  if (q.tehsil) query = query.eq('tehsil', q.tehsil)
  if (q.dateFrom) query = query.gte('flagged_at', q.dateFrom)
  if (q.dateTo) query = query.lte('flagged_at', q.dateTo)
  if (q.search) query = query.or(`psid.ilike.%${q.search}%,survey_id.ilike.%${q.search}%,notes.ilike.%${q.search}%`)

  const from = (q.page - 1) * q.pageSize
  const to = from + q.pageSize - 1

  const { data, error, count } = await query
    .order('flagged_at', { ascending: false })
    .range(from, to)

  if (error) return { error: error.message }

  return {
    data: data || [],
    total: count ?? 0,
    page: q.page,
    pageSize: q.pageSize,
  }
}

export async function createFlaggedEntry(sup: SupabaseClient, body: {
  psid: string
  survey_id?: string | null
  reason: string
  notes?: string | null
}) {
  const { psid, survey_id, reason, notes } = body

  if (!psid || !reason) return { error: 'psid and reason required' }
  if (!ALLOWED_REASONS.includes(reason as typeof ALLOWED_REASONS[number])) {
    return { error: `Invalid reason. Allowed: ${ALLOWED_REASONS.join(', ')}` }
  }

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

  if (error) return { error: error.message }

  const { data: { user: authUser } } = await sup.auth.getUser()
  if (authUser?.id && data) {
    await sup.from('flagged_psids').update({ flagged_by: authUser.id }).eq('id', data.id)
  }

  return { data }
}

export async function updateFlaggedEntry(sup: SupabaseClient, id: string, body: {
  resolved?: boolean
  notes?: string | null
  reason?: string
  resolution?: string
}) {
  if (!id) return { error: 'id param required' }

  const update: Record<string, unknown> = {}

  if (body.resolved === true) update.resolved_at = new Date().toISOString()
  if (body.notes !== undefined) update.notes = body.notes

  if (body.reason) {
    if (!ALLOWED_REASONS.includes(body.reason as typeof ALLOWED_REASONS[number])) {
      return { error: `Invalid reason. Allowed: ${ALLOWED_REASONS.join(', ')}` }
    }
    update.reason = body.reason
  }

  if (body.resolution) {
    if (!ALLOWED_RESOLUTIONS.includes(body.resolution as typeof ALLOWED_RESOLUTIONS[number])) {
      return { error: `Invalid resolution. Allowed: ${ALLOWED_RESOLUTIONS.join(', ')}` }
    }
    update.resolution = body.resolution
  }

  if (Object.keys(update).length === 0) return { error: 'No fields to update' }

  const { data, error } = await sup
    .from('flagged_psids')
    .update(update)
    .eq('id', id)
    .select(FLAGGED_COLS)
    .single()

  if (error) return { error: error.message }
  if (!data) return { error: 'Not found', status: 404 }

  return { data }
}

const PRIORITY: Record<string, number> = {
  field_deleted: 0,
  portal_deleted: 1,
  psid_duplicate_orphan: 2,
  psid_duplicate_superseded: 3,
  psid_duplicate_monthly: 4,
}

const ACTION_LABELS: Record<string, { action: string; label: string; icon: string }> = {
  field_deleted: { action: 'DO_NOT_DELIVER', label: 'Do not deliver — removed by field team', icon: 'stop' },
  portal_deleted: { action: 'DO_NOT_DELIVER', label: 'Do not deliver — removed from portal', icon: 'stop' },
  psid_duplicate_orphan: { action: 'DELIVER', label: 'Deliver this bill — other PSID had no payments', icon: 'check' },
  psid_duplicate_superseded: { action: 'DELIVER', label: 'Deliver this bill — this PSID had payments', icon: 'check' },
  psid_duplicate_monthly: { action: 'PENDING', label: 'Pending review — duplicate PSID found', icon: 'clock' },
}

function computeSummary(entries: { reason: string }[]) {
  if (!entries.length) return null
  const best = entries.reduce((a, b) =>
    (PRIORITY[a.reason] ?? 99) < (PRIORITY[b.reason] ?? 99) ? a : b
  )
  const info = ACTION_LABELS[best.reason] || { action: 'PENDING', label: 'Flagged — review needed', icon: 'flag' }
  return {
    action: info.action,
    label: info.label,
    icon: info.icon,
    plus_count: entries.length,
  }
}

export async function getFlaggedEntriesBySurvey(
  sup: SupabaseClient,
  surveyId?: string,
  psid?: string
) {
  if (!surveyId && !psid) return { flagged: false }

  let entries: { psid: string; reason: string; notes: string | null; flagged_at: string | null }[] = []

  if (surveyId) {
    const { data } = await sup
      .from('flagged_psids')
      .select('psid, reason, notes, flagged_at')
      .eq('survey_id', surveyId)
      .is('resolved_at', null)
    if (data?.length) entries = data
  }

  if (!entries.length && psid) {
    const { data } = await sup
      .from('flagged_psids')
      .select('psid, reason, notes, flagged_at')
      .eq('psid', psid)
      .is('resolved_at', null)
    if (data?.length) entries = data
  }

  return {
    flagged: entries.length > 0,
    entries,
    summary: computeSummary(entries),
  }
}
