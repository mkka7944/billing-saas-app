import { HierarchyData } from '@/hooks/use-hierarchy'
import { CITY_CONFIG } from '@/stores/billing-store'
import { shortenMCName, compareMC } from '@/lib/mc-utils'

export function getFilteredUcList(
  hierarchy: HierarchyData | undefined,
  selectedCity: string | null
): (HierarchyData['ucs'][string][number] & { short: string })[] {
  if (!hierarchy) return []
  const seen = new Set<string>()
  const list: (HierarchyData['ucs'][string][number] & { short: string })[] = []
  for (const [key, group] of Object.entries(hierarchy.ucs)) {
    if (selectedCity) {
      const cfg = CITY_CONFIG[selectedCity]
      if (cfg && key !== `${cfg.district}::${cfg.tehsil}`) continue
    }
    for (const u of group) {
      if (seen.has(u.value)) continue
      seen.add(u.value)
      list.push({ ...u, short: shortenMCName(u.value, selectedCity || undefined) })
    }
  }
  return list.sort((a, b) => compareMC(a.short, b.short))
}
