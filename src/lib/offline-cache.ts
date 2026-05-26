const CACHE_KEY = 'deliver-assignment-cache'

export interface CachedAssignment {
  data: Record<string, unknown> | null
  items: Record<string, unknown>[]
  cachedAt: number
}

export function cacheAssignment(data: Record<string, unknown> | null, items: Record<string, unknown>[]): void {
  try {
    const entry: CachedAssignment = { data, items, cachedAt: Date.now() }
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry))
  } catch {
    // storage full or unavailable
  }
}

export function getCachedAssignment(): CachedAssignment | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as CachedAssignment
  } catch {
    return null
  }
}

export function clearAssignmentCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY)
  } catch {
    // ignore
  }
}
