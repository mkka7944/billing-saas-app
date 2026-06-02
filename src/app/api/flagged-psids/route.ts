import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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

export async function GET(request: Request) {
  try {
    const sp = new URL(request.url).searchParams
    const surveyId = sp.get('survey_id')?.trim()
    const psid = sp.get('psid')?.trim()

    if (!surveyId && !psid) {
      return NextResponse.json({ flagged: false })
    }

    const sup = await createClient()
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

    return NextResponse.json({
      flagged: entries.length > 0,
      entries,
      summary: computeSummary(entries),
    })
  } catch (err) {
    console.error('flagged-psids route error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
