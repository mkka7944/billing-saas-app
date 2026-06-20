'use client'

import { useUdsTheme } from '@/hooks/use-uds-theme'
import { Sun, SunMoon } from 'lucide-react'
import { cn } from '@/lib/utils'

const THEMES = [
  { id: 'default' as const, label: 'Default', icon: Sun, desc: 'Standard contrast for indoor use' },
  { id: 'outdoor' as const, label: 'Outdoor', icon: SunMoon, desc: 'Higher contrast for bright sunlight' },
]

export function UdsThemeSelector() {
  const { theme, setTheme } = useUdsTheme()

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium">Delivery Sheet Theme</p>
      <div className="grid grid-cols-2 gap-2">
        {THEMES.map((t) => (
          <button
            key={t.id}
            onClick={() => setTheme(t.id)}
            className={cn(
              'flex flex-col items-center gap-1 rounded-lg border p-2.5 text-xs transition-colors cursor-pointer',
              theme === t.id
                ? 'border-primary bg-primary/10 text-foreground'
                : 'border-border text-muted-foreground hover:bg-muted'
            )}
          >
            <t.icon className="h-5 w-5" />
            <span className="font-medium">{t.label}</span>
            <span className="text-[10px] text-muted-foreground">{t.desc}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
