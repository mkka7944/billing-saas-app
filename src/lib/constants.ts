export const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']

export const STALE_BILLING = 5 * 60 * 1000
export const STALE_HIERARCHY = 30 * 60 * 1000
export const STALE_ASSIGNMENT = 2 * 60 * 1000

export function currentMonth(): string {
  const d = new Date()
  return `${MONTHS[d.getMonth()]}${d.getFullYear()}`
}

export function today(): string {
  return new Date().toISOString().slice(0, 10)
}
