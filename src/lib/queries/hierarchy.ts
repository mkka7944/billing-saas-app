export const CITY_TEHSIL_MAP: Record<string, { district: string; tehsil: string }> = {
  Sargodha: { district: 'SARGODHA', tehsil: 'SARGODHA' },
  Bhalwal: { district: 'SARGODHA', tehsil: 'BHALWAL' },
  Khushab: { district: 'KHUSHAB', tehsil: 'KHUSHAB' },
  TestCity: { district: 'TEST', tehsil: 'TEST' },
}

export const UC_HIERARCHY_COLS = [
  'uc_name',
  'city_district',
  'tehsil',
] as const

export interface UCStatRow {
  uc_name: string
  total_units: number
  active_units: number
  archived_units: number
  billed: number
  paid: number
  collected: number
  surveyors: number
  no_coords: number
  assigned_today: number
  delivered_today: number
  missed_today: number
}

export function getCityFromTehsil(district: string, tehsil: string): string | null {
  for (const [city, cfg] of Object.entries(CITY_TEHSIL_MAP)) {
    if (cfg.district === district && cfg.tehsil === tehsil) return city
  }
  return null
}
