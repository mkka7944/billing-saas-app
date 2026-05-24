import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface HierarchyOption {
  value: string
  label: string
  count: number
}

interface HierarchyResponse {
  districts: HierarchyOption[]
  tehsils: Record<string, HierarchyOption[]>
  ucs: Record<string, HierarchyOption[]>
  surveyors: string[]
}

export const maxDuration = 30

export async function GET() {
  const supabase = await createClient()

  const [hierRes, survRes] = await Promise.all([
    supabase.from('hierarchy').select('city_district, tehsil, uc_name').order('city_district').order('tehsil').order('uc_name'),
    supabase.from('surveyors').select('name').eq('is_active', true).order('name'),
  ])

  const rows = (hierRes.data || []) as { city_district: string; tehsil: string; uc_name: string }[]
  const surveyorRows = (survRes.data || []) as { name: string }[]

  const seen = new Set<string>()
  const districtMap = new Map<string, number>()
  const tehsilMap = new Map<string, Map<string, number>>()
  const ucMap = new Map<string, Map<string, number>>()

  for (const row of rows) {
    const d = row.city_district || 'Unknown'
    const t = row.tehsil || 'Unknown'
    const u = row.uc_name || 'Unknown'

    const key = `${d}|${t}|${u}`
    if (seen.has(key)) continue
    seen.add(key)

    districtMap.set(d, (districtMap.get(d) || 0) + 1)
    if (!tehsilMap.has(d)) tehsilMap.set(d, new Map())
    const tg = tehsilMap.get(d)!
    tg.set(t, (tg.get(t) || 0) + 1)
    const ucKey = `${d}::${t}`
    if (!ucMap.has(ucKey)) ucMap.set(ucKey, new Map())
    const ug = ucMap.get(ucKey)!
    ug.set(u, (ug.get(u) || 0) + 1)
  }

  const districts: HierarchyOption[] = Array.from(districtMap.entries())
    .map(([value, count]) => ({ value, label: value, count }))
    .sort((a, b) => a.label.localeCompare(b.label))

  const tehsils: Record<string, HierarchyOption[]> = {}
  for (const [dist, tg] of tehsilMap) {
    tehsils[dist] = Array.from(tg.entries())
      .map(([value, count]) => ({ value, label: value, count }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }

  const ucs: Record<string, HierarchyOption[]> = {}
  for (const [key, ug] of ucMap) {
    ucs[key] = Array.from(ug.entries())
      .map(([value, count]) => ({ value, label: value, count }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }

  const surveyors = surveyorRows.map((r) => r.name).filter(Boolean).sort()

  return NextResponse.json({ districts, tehsils, ucs, surveyors } satisfies HierarchyResponse)
}
