const PKT = 'Asia/Karachi'

export function pktToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: PKT })
}

export function pktDayRange(): { start: string; end: string } {
  const today = pktToday()
  return {
    start: `${today}T00:00:00+05:00`,
    end: `${today}T23:59:59+05:00`,
  }
}

export function pktCurrentMonth(): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: PKT,
    month: 'short',
    year: 'numeric',
  })
  const parts = formatter.formatToParts(new Date())
  const month = parts.find((p) => p.type === 'month')!.value.toUpperCase()
  const year = parts.find((p) => p.type === 'year')!.value
  const day = parseInt(
    new Intl.DateTimeFormat('en-US', { timeZone: PKT, day: 'numeric' }).format(new Date()),
    10
  )
  const monthIndex = 'JANFEBMARAPRMAYJUNJULAUGSEPOCTNOVDEC'.indexOf(month) / 3
  const d = new Date(year as unknown as number, monthIndex, day)
  if (d.getDate() < 16) d.setMonth(d.getMonth() - 1)
  const m = 'JANFEBMARAPRMAYJUNJULAUGSEPOCTNOVDEC'.substring(d.getMonth() * 3, d.getMonth() * 3 + 3)
  return `${m}${d.getFullYear()}`
}
