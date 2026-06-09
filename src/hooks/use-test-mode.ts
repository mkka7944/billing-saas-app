'use client'

import { useQuery } from '@tanstack/react-query'

interface TestModeResponse {
  enabled: boolean
}

export function useTestMode() {
  return useQuery<TestModeResponse>({
    queryKey: ['test-mode'],
    queryFn: async () => {
      const res = await fetch('/api/settings')
      if (!res.ok) return { enabled: false }
      const data = await res.json()
      return { enabled: data?.test_mode?.enabled === true }
    },
    staleTime: 2 * 60 * 1000,
  })
}
