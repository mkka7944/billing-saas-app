'use client'

import { cn } from '@/lib/utils'

interface PageLoaderProps {
  visible: boolean
}

export function PageLoader({ visible }: PageLoaderProps) {
  return (
    <div
      className={cn(
        'fixed inset-0 z-[9998] flex items-center justify-center pointer-events-none transition-opacity duration-200',
        visible ? 'opacity-100' : 'opacity-0'
      )}
    >
      <div className="flex items-center gap-[5px]">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="block w-2 h-2 bg-primary rounded-full animate-bounce-dot"
            style={{
              animationDelay: `${i * 0.15}s`,
            }}
          />
        ))}
      </div>
    </div>
  )
}
