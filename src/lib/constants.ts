export const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']

import { pktToday, pktCurrentMonth } from './pkt'

export function sortMonths(a: string, b: string): number {
  const da = new Date(`${a.slice(0,3)} 1, ${a.slice(3)}`)
  const db = new Date(`${b.slice(0,3)} 1, ${b.slice(3)}`)
  return da.getTime() - db.getTime()
}

export const STALE_BILLING = 5 * 60 * 1000
export const STALE_HIERARCHY = 30 * 60 * 1000
export const STALE_ASSIGNMENT = 2 * 60 * 1000

export function currentMonth(): string {
  return pktCurrentMonth()
}

export function today(): string {
  return pktToday()
}
