'use client'

import { useState } from 'react'
import { useBillingStore } from '@/stores/billing-store'
import { cn } from '@/lib/utils'
import { ChevronDown } from 'lucide-react'

interface CityIdentity {
  city: string | null
  district: string | null
  tehsil: string | null
  color: string
  gradient: string
  label: string
  subtitle: string
}

const CITY_OPTIONS: CityIdentity[] = [
  { city: 'Sargodha', district: 'SARGODHA', tehsil: 'SARGODHA', color: 'text-emerald-500 dark:text-emerald-300', gradient: 'from-emerald-500/20 dark:from-emerald-400/20 to-emerald-500/5', label: 'SGD', subtitle: 'Headquarters' },
  { city: 'Bhalwal', district: 'SARGODHA', tehsil: 'BHALWAL', color: 'text-blue-500 dark:text-blue-300', gradient: 'from-blue-500/20 dark:from-blue-400/20 to-blue-500/5', label: 'BHL', subtitle: 'Branch Office' },
  { city: 'Khushab', district: 'KHUSHAB', tehsil: 'KHUSHAB', color: 'text-amber-500 dark:text-amber-300', gradient: 'from-amber-500/20 dark:from-amber-400/20 to-amber-500/5', label: 'KHB', subtitle: 'Regional Office' },
  { city: null, district: null, tehsil: null, color: 'text-primary', gradient: 'from-primary/20 via-blue-500/10 to-emerald-500/10', label: 'ALL', subtitle: 'Global Context' },
]

function currentIdentity(city: string | null): CityIdentity {
  if (!city) return CITY_OPTIONS[3]
  return CITY_OPTIONS.find((c) => c.city === city) || CITY_OPTIONS[3]
}

function CityAvatar({ identity, size }: { identity: CityIdentity; size: 'sm' | 'md' }) {
  return (
    <div className={cn(
      'relative flex items-center justify-center rounded-lg font-bold shrink-0 overflow-hidden',
      size === 'sm' ? 'h-8 w-8 text-[10px]' : 'h-9 w-9 text-[10px]',
      `bg-gradient-to-br ${identity.gradient}`
    )}>
      <span className={cn(identity.color, 'relative z-10')}>{identity.label}</span>
      <div className="absolute inset-0 bg-background/20 backdrop-blur-[2px]" />
    </div>
  )
}

export function CitySwitcher({ isCollapsed }: { isCollapsed?: boolean }) {
  const selectedCity = useBillingStore((s) => s.selectedCity)
  const setCity = useBillingStore((s) => s.setCity)
  const [open, setOpen] = useState(false)

  const current = currentIdentity(selectedCity)

  if (isCollapsed) {
    return (
      <div className="flex justify-center py-2">
        <CityAvatar identity={current} size="sm" />
      </div>
    )
  }

  return (
    <div className="relative px-3 py-2">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 p-1.5 rounded-lg hover:bg-sidebar-accent/30 transition-all cursor-pointer group"
      >
        <CityAvatar identity={current} size="md" />
        <div className="flex flex-col items-start overflow-hidden flex-1 text-left">
          <span className="text-sm font-bold text-sidebar-foreground leading-tight truncate w-full">
            {selectedCity || 'All Cities'}
          </span>
          <span className="text-[10px] text-sidebar-foreground/50 font-medium leading-none mt-1 truncate w-full">
            {current.subtitle}
          </span>
        </div>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-sidebar-foreground/40" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-3 right-3 top-full z-50 mt-1 bg-popover border border-border rounded-lg shadow-lg p-1.5">
            <div className="px-2 py-1.5 text-[10px] font-bold text-muted-foreground/60 dark:text-muted-foreground/80 uppercase tracking-widest mb-1 border-b border-border/40">
              Switch City
            </div>
            {CITY_OPTIONS.map((opt) => (
              <button
                key={opt.label}
                onClick={() => { setCity(opt.city, opt.district, opt.tehsil); setOpen(false) }}
                className={cn(
                  'w-full flex items-center gap-3 p-1.5 rounded-md transition-colors cursor-pointer text-left',
                  current.city === opt.city
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-accent/50 text-foreground/80'
                )}
              >
                <CityAvatar identity={opt} size="sm" />
                <div className="flex flex-col items-start overflow-hidden flex-1">
                  <span className={cn(
                    'text-xs font-bold leading-tight',
                    current.city === opt.city ? 'text-foreground' : 'text-foreground/80'
                  )}>
                    {opt.city || 'All Cities'}
                  </span>
                  <span className="text-[10px] text-muted-foreground/60 dark:text-muted-foreground/80 font-medium leading-none mt-0.5">
                    {opt.subtitle}
                  </span>
                </div>
                {current.city === opt.city && (
                  <div className="h-1.5 w-1.5 rounded-full bg-foreground/30 shrink-0" />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
