'use client'

import { useState, useEffect, useCallback } from 'react'
import { UDS_THEMES, type UdsThemeId, type UdsTheme } from '@/config/uds-themes'

const STORAGE_KEY = 'uds-theme'

export function useUdsTheme(): { theme: UdsThemeId; setTheme: (id: UdsThemeId) => void; classes: UdsTheme } {
  const [theme, setThemeState] = useState<UdsThemeId>('default')

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored === 'default' || stored === 'outdoor') {
        setThemeState(stored)
      }
    } catch { /* localStorage unavailable */ }
  }, [])

  const setTheme = useCallback((id: UdsThemeId) => {
    setThemeState(id)
    try {
      localStorage.setItem(STORAGE_KEY, id)
    } catch { /* localStorage unavailable */ }
  }, [])

  return { theme, setTheme, classes: UDS_THEMES[theme] }
}
