'use client'

import { useSettings } from '@/hooks/use-settings'

export function useMapZoom() {
  const { data: settings, isLoading } = useSettings()
  const zoom = settings?.map_zoom
  return { data: typeof zoom === 'number' ? zoom : 18, isLoading }
}
