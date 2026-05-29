'use client'

import { useQuery } from '@tanstack/react-query'

export interface RouteUnit {
  survey_id: string
  consumer_name: string | null
  address: string | null
  psid: string | null
  amount_due: number | null
  monthly_fee: number | null
  arrears: number | null
  route_seq: number | null
  lat: number | null
  lng: number | null
}

export interface RouteGroup {
  route_name: string
  unit_count: number
  first_stop: string | null
  last_stop: string | null
}

export interface UCWithRoutes {
  uc: string
  routes: RouteGroup[]
}

export interface CityWithRoutes {
  city: string
  ucs: UCWithRoutes[]
}

export function useRouteTree(city?: string | null, tehsil?: string | null) {
  return useQuery<CityWithRoutes[]>({
    queryKey: ['route-tree', city, tehsil],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (city) params.set('city', city)
      if (tehsil) params.set('tehsil', tehsil)
      const res = await fetch(`/api/routes?${params}`)
      if (!res.ok) throw new Error('Failed to fetch routes')
      const json = await res.json()
      return json.data || []
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useRouteUnits(city: string | null, routeName: string | null, tehsil?: string | null) {
  return useQuery<RouteUnit[]>({
    queryKey: ['route-units', city, routeName, tehsil],
    queryFn: async () => {
      if (!city || !routeName) return []
      const params = new URLSearchParams({ city, route: routeName })
      if (tehsil) params.set('tehsil', tehsil)
      const res = await fetch(`/api/routes?${params}`)
      if (!res.ok) throw new Error('Failed to fetch route units')
      const json = await res.json()
      return json.data || []
    },
    enabled: !!city && !!routeName,
    staleTime: 5 * 60 * 1000,
  })
}
