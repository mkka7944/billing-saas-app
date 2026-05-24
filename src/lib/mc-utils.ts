const CITY_NAMES = ['Bhalwal', 'Sargodha', 'Mianwali', 'Khushab', 'Tehsil']

const UC_COLORS = [
  '#0072f5', '#e5484d', '#ffb224', '#36a2eb', '#ff6384',
  '#4bc0c0', '#9966ff', '#ff9f40', '#7c3aed', '#0ea5e9',
  '#f43f5e', '#10b981', '#f59e0b', '#6366f1', '#14b8a6',
  '#a855f7', '#ef4444', '#22c55e', '#eab308', '#3b82f6',
]

export function shortenMCName(name: string | null, district?: string, tehsil?: string): string {
  if (!name) return 'Unknown'

  let cleaned = name.toUpperCase()

  if (district) cleaned = cleaned.replace(new RegExp(`${district.toUpperCase()} - `, 'g'), '')
  if (tehsil) cleaned = cleaned.replace(new RegExp(`${tehsil.toUpperCase()} - `, 'g'), '')

  for (const city of CITY_NAMES) {
    const escaped = city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    cleaned = cleaned.replace(new RegExp(`\\s*${escaped.toUpperCase()}\\s*`, 'g'), ' ')
  }

  cleaned = cleaned.replace(/\s+/g, ' ').trim()

  if (district?.toUpperCase() === 'KHUSHAB') return cleaned

  const match = cleaned.match(/(MC|UC|ZONE|WARD)[-\s]*(\d+)/i)
  if (match) {
    const prefix = match[1].toUpperCase()
    const num = match[2]
    return `${prefix}-${num}`
  }

  return cleaned.split(',')[0].trim().split(' ')[0] || 'Unknown'
}

export function getUcColor(ucName: string | null): string {
  if (!ucName) return '#9ca3af'
  let hash = 0
  for (let i = 0; i < ucName.length; i++) {
    hash = ((hash << 5) - hash) + ucName.charCodeAt(i)
    hash = hash & hash
  }
  return UC_COLORS[Math.abs(hash) % UC_COLORS.length]
}

export function compareMC(a: string, b: string): number {
  const aIsMC = a.startsWith('MC')
  const bIsMC = b.startsWith('MC')
  if (aIsMC && !bIsMC) return -1
  if (!aIsMC && bIsMC) return 1
  const aNum = parseInt(a.replace(/[^0-9]/g, '')) || 0
  const bNum = parseInt(b.replace(/[^0-9]/g, '')) || 0
  if (aNum !== bNum) return aNum - bNum
  return a.localeCompare(b)
}
