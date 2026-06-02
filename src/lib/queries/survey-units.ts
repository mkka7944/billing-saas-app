import { SURVEY_UNIT_COLS } from './constants'

/**
 * Filter that correctly captures all active-enriched units:
 * - `status = 'ACTIVE'` (explicitly set by enrichment when lifecycle says "not deleted")
 * - `status IS NULL` (unenriched records that are effectively active)
 *
 * Use this instead of `.eq('status', 'ACTIVE')` everywhere.
 */
export const STATUS_ACTIVE_FILTER = 'status.is.null,status.eq.ACTIVE'

export function applyActiveFilter(query: any): any {
  return query.or(STATUS_ACTIVE_FILTER)
}

export function applyArchivedFilter(query: any): any {
  return query.not('status', 'is', null).neq('status', 'ACTIVE')
}

export function selectUnitCols(query: any, extraCols: string[] = []): any {
  return query.select([...SURVEY_UNIT_COLS, ...extraCols].join(','))
}
