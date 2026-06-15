'use client'

import { useSettings } from '@/hooks/use-settings'

export function useTestMode() {
  const { data: settings } = useSettings()
  const enabled = settings?.test_mode?.enabled === true
  return { data: { enabled }, isLoading: false }
}
