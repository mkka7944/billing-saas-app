import { NextResponse } from 'next/server'

const PROJECT_REF = 'qrxbsoqepfaryolwcedk'
const MGMT_API = 'https://api.supabase.com/v1'
const PAT = process.env.SUPABASE_ACCESS_TOKEN || ''

interface TableInfo {
  name: string
  schema: string
  sizeBytes: number
  rowEstimate: number
}

interface UsageData {
  plan: string
  billingCycle: { start: string; end: string }
  bandwidth: { usedMb: number | null; limitMb: number; estimated: boolean }
  apiRequests: { total: number; hourly: { timestamp: string; rest: number; auth: number; realtime: number; storage: number }[] }
  database: { totalMb: number; tables: { name: string; sizeMb: number; rows: number }[] }
  storage: { totalMb: number; buckets: { name: string; sizeMb: number; count: number }[] }
  kpis: {
    deliveriesToday: number
    photosThisMonth: number
    photosTotal: number
    activeStaffThisMonth: number
    assignmentsThisMonth: number
    unitsActive: number
    unitsTotal: number
    collectionThisMonth: number
  }
}

async function queryDb(sql: string): Promise<any[]> {
  const res = await fetch(`${MGMT_API}/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${PAT}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`DB query failed: ${err}`)
  }
  return res.json()
}

async function fetchMgmt(path: string): Promise<any> {
  const res = await fetch(`${MGMT_API}${path}`, {
    headers: { 'Authorization': `Bearer ${PAT}` },
  })
  if (!res.ok) return null
  return res.json()
}

export async function GET() {
  try {
    const orgId = 'egcdeijulodqozlinrum'
    const plan = 'free'
    const bandwidthLimitMb = 5 * 1024
    const dbLimitMb = 500
    const storageLimitMb = 1024

    const [orgInfo, apiRequestsRes, apiCountsRes, dbSizeRows, tableRows, storageRows, kpiRows] = await Promise.all([
      fetchMgmt(`/organizations/${orgId}`).catch(() => null),
      fetchMgmt(`/projects/${PROJECT_REF}/analytics/endpoints/usage.api-requests-count`).catch(() => null),
      fetchMgmt(`/projects/${PROJECT_REF}/analytics/endpoints/usage.api-counts?interval=1day`).catch(() => null),
      queryDb("SELECT pg_database_size(current_database()) as size_bytes").catch(() => [{ size_bytes: 0 }]),
      queryDb("SELECT schemaname, relname, pg_total_relation_size(quote_ident(schemaname)||'.'||quote_ident(relname)) as size_bytes, n_live_tup as row_estimate FROM pg_stat_user_tables ORDER BY size_bytes DESC LIMIT 20").catch(() => []),
      queryDb("SELECT bucket_id, COUNT(*) as object_count, COALESCE(SUM((metadata->>'contentLength')::bigint), 0) as total_bytes FROM storage.objects GROUP BY bucket_id").catch(() => []),
      queryDb("SELECT (SELECT COUNT(*) FROM assignment_items WHERE delivered_at::date = CURRENT_DATE) as deliveries_today, (SELECT COUNT(*) FROM delivery_photos WHERE captured_at >= date_trunc('month', now())) as photos_this_month, (SELECT COUNT(*) FROM delivery_photos) as photos_total, (SELECT COUNT(DISTINCT d.staff_id) FROM daily_assignments d WHERE d.created_at >= date_trunc('month', now())) as active_staff, (SELECT COUNT(*) FROM daily_assignments WHERE created_at >= date_trunc('month', now())) as assignments_this_month, (SELECT COUNT(*) FROM survey_units WHERE status IS NULL OR status = 'ACTIVE') as units_active, (SELECT COUNT(*) FROM survey_units) as units_total, (SELECT COALESCE(SUM(amount_paid), 0) FROM payment_history WHERE paid_date >= date_trunc('month', now())::date) as collection_this_month").catch(() => [{ deliveries_today: 0, photos_this_month: 0, photos_total: 0, active_staff: 0, assignments_this_month: 0, units_active: 0, units_total: 0, collection_this_month: 0 }]),
    ])

    const actualPlan = (orgInfo?.plan || plan) as string

    const apiTotal = apiRequestsRes?.result?.[0]?.count ?? 0

    const hourly = (apiCountsRes?.result || []).map((r: any) => ({
      timestamp: r.timestamp,
      rest: r.total_rest_requests ?? 0,
      auth: r.total_auth_requests ?? 0,
      realtime: r.total_realtime_requests ?? 0,
      storage: r.total_storage_requests ?? 0,
    }))

    const dbTotalBytes = dbSizeRows[0]?.size_bytes ?? 0

    const tableList = (tableRows || []).map((t: any) => ({
      name: `${t.schemaname}.${t.relname}`,
      sizeMb: Math.round((t.size_bytes / (1024 * 1024)) * 100) / 100,
      rows: t.row_estimate ?? 0,
    }))

    const storageTotalBytes = (storageRows || []).reduce((sum: number, b: any) => sum + Number(b.total_bytes), 0)
    const bucketList = (storageRows || []).map((b: any) => ({
      name: b.bucket_id,
      sizeMb: Math.round((Number(b.total_bytes) / (1024 * 1024)) * 100) / 100,
      count: Number(b.object_count),
    }))

    const kpi = kpiRows[0] || { deliveries_today: 0, photos_this_month: 0, photos_total: 0, active_staff: 0, assignments_this_month: 0, units_active: 0, units_total: 0, collection_this_month: 0 }

    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth()
    const billStart = new Date(year, month, 22)
    if (now < billStart) billStart.setMonth(month - 1)
    const billEnd = new Date(billStart)
    billEnd.setMonth(billEnd.getMonth() + 1)

    const usage: UsageData = {
      plan: actualPlan,
      billingCycle: {
        start: billStart.toISOString().slice(0, 10),
        end: billEnd.toISOString().slice(0, 10),
      },
      bandwidth: {
        usedMb: null,
        limitMb: bandwidthLimitMb,
        estimated: true,
      },
      apiRequests: {
        total: apiTotal,
        hourly,
      },
      database: {
        totalMb: Math.round((dbTotalBytes / (1024 * 1024)) * 100) / 100,
        tables: tableList,
      },
      storage: {
        totalMb: Math.round((storageTotalBytes / (1024 * 1024)) * 100) / 100,
        buckets: bucketList,
      },
      kpis: {
        deliveriesToday: Number(kpi.deliveries_today),
        photosThisMonth: Number(kpi.photos_this_month),
        photosTotal: Number(kpi.photos_total),
        activeStaffThisMonth: Number(kpi.active_staff),
        assignmentsThisMonth: Number(kpi.assignments_this_month),
        unitsActive: Number(kpi.units_active),
        unitsTotal: Number(kpi.units_total),
        collectionThisMonth: Number(kpi.collection_this_month),
      },
    }

    return NextResponse.json(usage, {
      headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300' },
    })
  } catch (err) {
    console.error('admin/usage error:', err)
    return NextResponse.json({ error: 'Failed to fetch usage data' }, { status: 500 })
  }
}
