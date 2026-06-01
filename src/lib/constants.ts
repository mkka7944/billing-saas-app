export const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']

export function sortMonths(a: string, b: string): number {
  const da = new Date(`${a.slice(0,3)} 1, ${a.slice(3)}`)
  const db = new Date(`${b.slice(0,3)} 1, ${b.slice(3)}`)
  return da.getTime() - db.getTime()
}

export const STALE_BILLING = 5 * 60 * 1000
export const STALE_HIERARCHY = 30 * 60 * 1000
export const STALE_ASSIGNMENT = 2 * 60 * 1000

export function currentMonth(): string {
  const d = new Date()
  // Billing cycle: 16th of current month to 15th of next month.
  // If day < 16, the billing month is the previous calendar month.
  if (d.getDate() < 16) d.setMonth(d.getMonth() - 1)
  return `${MONTHS[d.getMonth()]}${d.getFullYear()}`
}

export function today(): string {
  return new Date().toISOString().slice(0, 10)
}
