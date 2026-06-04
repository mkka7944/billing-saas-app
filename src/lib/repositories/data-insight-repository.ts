import type { SupabaseClient } from '@supabase/supabase-js'

export interface DrillDownParams {
  billMonth: string
  district: string
  tehsil: string
  drillUC: string
  dbStatus: string
  statusFilter: string
  page: number
  pageSize: number
  sort: { field: string; ascending: boolean }
}

export async function getDrillDownUnits(sup: SupabaseClient, p: DrillDownParams) {
  const { data: raw, error: rpcErr } = await sup.rpc('get_hierarchy_stats', {
    p_month: p.billMonth,
    p_district: p.district,
    p_tehsil: p.tehsil,
    p_uc: p.drillUC,
    p_status: p.dbStatus || '',
  })

  if (rpcErr) return { error: rpcErr.message }

  const r = (typeof raw === 'string' ? JSON.parse(raw) : raw) as {
    kpis?: Record<string, number>
  } | null

  let unitQuery = sup
    .from('survey_units')
    .select('survey_id, psid, consumer_name, status, surveyor_name, survey_date, survey_time, monthly_fee, arrears', { count: 'exact' })
    .eq('uc_name', p.drillUC)

  if (p.dbStatus === 'ACTIVE') {
    unitQuery = unitQuery.or('status.is.null,status.eq.ACTIVE')
  } else if (p.dbStatus === 'ARCHIVED') {
    unitQuery = unitQuery.not('status', 'is', null).neq('status', 'ACTIVE')
  }

  if (p.statusFilter === 'duplicates') {
    const { data: dupEntries } = await sup
      .from('flagged_psids')
      .select('survey_id')
      .in('reason', ['psid_duplicate_orphan', 'psid_duplicate_superseded', 'psid_duplicate_monthly'])
      .is('resolved_at', null)
      .not('survey_id', 'is', null)

    const dupSurveyIds = [...new Set((dupEntries || []).map(d => d.survey_id))]
    unitQuery = dupSurveyIds.length
      ? unitQuery.in('survey_id', dupSurveyIds)
      : unitQuery.in('survey_id', ['__NONE__'])
  }

  if (p.district) unitQuery = unitQuery.eq('city_district', p.district)
  if (p.tehsil) unitQuery = unitQuery.eq('tehsil', p.tehsil)

  const { data: units, count: unitTotal, error: unitErr } = await unitQuery
    .order(p.sort.field, { ascending: p.sort.ascending })
    .range((p.page - 1) * p.pageSize, (p.page - 1) * p.pageSize + p.pageSize - 1)

  if (unitErr) return { error: unitErr.message }

  let unitRows = (units || []).map(u => ({
    survey_id: u.survey_id,
    psid: u.psid,
    consumer_name: u.consumer_name,
    status: u.status,
    surveyor_name: u.surveyor_name,
    survey_date: u.survey_date,
    survey_time: u.survey_time,
    amount_paid: 0,
    monthly_fee: u.monthly_fee ?? 0,
    arrears: u.arrears ?? 0,
  }))

  const psids = (units || []).map(u => u.psid)

  if (psids.length) {
    const { data: payments } = await sup
      .from('payment_history')
      .select('psid, amount_paid')
      .eq('bill_month', p.billMonth)
      .eq('payment_status', 'paid')
      .in('psid', psids)

    const paymentMap = new Map((payments || []).map(p => [p.psid, p.amount_paid ?? 0]))
    unitRows = unitRows.map(u => ({ ...u, amount_paid: paymentMap.get(u.psid) || 0 }))
  }

  if ((p.statusFilter === 'archived' || p.statusFilter === 'duplicates') && psids.length) {
    const { data: flagged } = await sup
      .from('flagged_psids')
      .select('psid, reason, notes, flagged_at, survey_id')
      .in('psid', psids)
      .is('resolved_at', null)

    if (flagged) {
      const priority: Record<string, number> = {
        field_deleted: 0, portal_deleted: 1, psid_duplicate_orphan: 2,
        psid_duplicate_superseded: 3, psid_duplicate_monthly: 4,
      }
      const labels: Record<string, { action: string; label: string; icon: string }> = {
        field_deleted: { action: 'DO_NOT_DELIVER', label: 'Do not deliver — removed by field team', icon: 'stop' },
        portal_deleted: { action: 'DO_NOT_DELIVER', label: 'Do not deliver — removed from portal', icon: 'stop' },
        psid_duplicate_orphan: { action: 'DELIVER', label: 'Deliver this bill — other PSID had no payments', icon: 'check' },
        psid_duplicate_superseded: { action: 'DELIVER', label: 'Deliver this bill — this PSID had payments', icon: 'check' },
        psid_duplicate_monthly: { action: 'PENDING', label: 'Pending review — duplicate PSID found', icon: 'clock' },
      }

      unitRows = unitRows.map(u => {
        const entriesForUnit = flagged.filter(f =>
          (u.survey_id && f.survey_id === u.survey_id) || f.psid === u.psid
        )
        if (!entriesForUnit.length) return { ...u, flagged_reason: null }
        const best = entriesForUnit.reduce((a, b) =>
          (priority[a.reason] ?? 99) < (priority[b.reason] ?? 99) ? a : b
        )
        const info = labels[best.reason] || { action: 'PENDING', label: 'Flagged', icon: 'flag' }
        return {
          ...u,
          flagged_reason: best.reason,
          flagged_notes: best.notes,
          flagged_at: best.flagged_at,
          flagged_summary: {
            action: info.action,
            label: info.label,
            icon: info.icon,
            plus_count: entriesForUnit.length,
          },
          flagged_entries: entriesForUnit.map(e => ({
            psid: e.psid, reason: e.reason, notes: e.notes,
          })),
        }
      })
    }
  }

  return { unitRows, kpis: r?.kpis, total: unitTotal || 0 }
}
