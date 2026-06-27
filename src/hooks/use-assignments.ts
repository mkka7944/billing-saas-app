'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { DailyAssignment, AssignmentItemWithUnit } from '@/types'
import { currentMonth } from '@/lib/constants'
import { STALE_TIMES } from '@/lib/queries/constants'
import { useBillingStore } from '@/stores/billing-store'
import { CITY_TEHSIL_MAP } from '@/lib/queries/hierarchy'

export interface UCTotals {
  uc_name: string
  total: number
  assigned: number
  unassigned: number
}

export interface UnassignedBill {
  survey_id: string
  consumer_name: string | null
  address: string | null
  lat: number | null
  lng: number | null
  psid: string | null
  monthly_fee: number | null
  arrears: number | null
  route_seq: number | null
  route_name: string | null
  surveyor_name: string | null
  survey_date: string | null
  survey_time: string | null
}

export interface StaffMember {
  id: string
  full_name: string | null
  assigned_city: string | null
  assigned_ucs: string[] | null
  assigned_cities: string[] | null
  is_active: boolean
}

export function useAssignmentTotals(month: string = currentMonth(), district?: string | null, tehsil?: string | null) {
  return useQuery<UCTotals[]>({
    queryKey: ['assignment-totals', month, district, tehsil],
    queryFn: async () => {
      const params = new URLSearchParams({ totals: 'true', month })
      if (district) params.set('district', district)
      if (tehsil) params.set('tehsil', tehsil)
      const res = await fetch(`/api/assignments?${params}`)
      if (!res.ok) throw new Error('Failed to fetch totals')
      const json = await res.json()
      return json.data || []
    },
    staleTime: STALE_TIMES.DELIVERY,
  })
}

export function useUnassignedBills(uc: string | null, month: string = currentMonth(), routeName?: string) {
  const selectedCity = useBillingStore((s) => s.selectedCity)
  const cfg = selectedCity ? CITY_TEHSIL_MAP[selectedCity] : null
  return useQuery<{ data: UnassignedBill[]; total: number }>({
    queryKey: ['unassigned-bills', uc, month, routeName, selectedCity],
    queryFn: async () => {
      if (!uc) return { data: [], total: 0 }
      const params = new URLSearchParams({ uc, month })
      if (routeName) params.set('route_name', routeName)
      if (cfg) {
        params.set('district', cfg.district)
        params.set('tehsil', cfg.tehsil)
      }
      const res = await fetch(`/api/assignments?${params}`)
      if (!res.ok) throw new Error('Failed to fetch unassigned bills')
      const json = await res.json()
      return { data: json.data || [], total: json.total ?? 0 }
    },
    enabled: !!uc,
    staleTime: STALE_TIMES.DELIVERY,
  })
}

export function useStaffList() {
  return useQuery<StaffMember[]>({
    queryKey: ['staff-list'],
    queryFn: async () => {
      const res = await fetch('/api/staff')
      if (!res.ok) throw new Error('Failed to fetch staff')
      const json = await res.json()
      return json.data || []
    },
    staleTime: STALE_TIMES.BILLING,
  })
}

export function useCreateAssignment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: { staff_id: string; issued_at?: string; uc_name: string; psids: string[]; bill_month?: string; routeSeqMap?: Record<string, number>; target_per_day?: number }) => {
      const res = await fetch('/api/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to create assignment')
      }
      return res.json()
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['assignment-totals'] })
      qc.invalidateQueries({ queryKey: ['assignment-list'] })
      qc.invalidateQueries({ queryKey: ['uc-stats'] })
      qc.invalidateQueries({ queryKey: ['unassigned-bills', vars.uc_name] })
      qc.invalidateQueries({ queryKey: ['staff-assignment'] })
      qc.invalidateQueries({ queryKey: ['staff-stats'] })
      qc.invalidateQueries({ queryKey: ['staff-performance'] })
    },
  })
}

export function useStaffAssignment(staffId: string | null) {
  return useQuery<{ data: DailyAssignment | null; items: AssignmentItemWithUnit[] }>({
    queryKey: ['staff-assignment', staffId],
    queryFn: async () => {
      if (!staffId) return { data: null, items: [] }
      const res = await fetch(`/api/assignments?staff_id=${staffId}`)
      if (!res.ok) throw new Error('Failed to fetch assignment')
      return res.json()
    },
    enabled: !!staffId,
    staleTime: STALE_TIMES.DELIVERY,
  })
}

export interface AssignmentWithStats {
  id: string
  staff_id: string
  staff_name: string
  issued_at: string
  uc_name: string
  name: string | null
  target_per_day: number | null
  total_items: number
  bill_month: string
  pending: number
  processing: number
  delivered: number
  missed: number
  completion_pct: number
  created_at: string
}

export function useAssignmentList(district?: string | null, tehsil?: string | null, month?: string) {
  return useQuery<AssignmentWithStats[]>({
    queryKey: ['assignment-list', district, tehsil, month],
    queryFn: async () => {
      const params = new URLSearchParams({ list: 'true' })
      if (district) params.set('district', district)
      if (tehsil) params.set('tehsil', tehsil)
      if (month) params.set('month', month)
      const res = await fetch(`/api/assignments?${params}`)
      if (!res.ok) throw new Error('Failed to fetch assignments')
      const json = await res.json()
      return json.data || []
    },
    staleTime: STALE_TIMES.DELIVERY,
  })
}

export interface RouteUc {
  uc: string
  routes: { route_name: string; unit_count: number }[]
  unrouted: number
}

export interface RouteCity {
  city: string
  ucs: RouteUc[]
}

export function useRouteTree(city: string | null) {
  return useQuery<RouteCity[]>({
    queryKey: ['route-tree', city],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (city) params.set('city', city)
      const res = await fetch(`/api/routes?${params}`)
      if (!res.ok) throw new Error('Failed to fetch route tree')
      const json = await res.json()
      return json.data || []
    },
    staleTime: 60 * 1000,
  })
}

export interface RouteUnit {
  survey_id: string
  consumer_name: string | null
  psid: string | null
  monthly_fee: number | null
  arrears: number | null
  route_seq: number | null
  surveyor_name: string | null
  survey_date: string | null
  survey_time: string | null
}

export function useRouteUnits(city: string | null, route: string | null) {
  return useQuery<{ data: RouteUnit[]; total: number }>({
    queryKey: ['route-units', city, route],
    queryFn: async () => {
      if (!city || !route) return { data: [], total: 0 }
      const params = new URLSearchParams({ city, route })
      const res = await fetch(`/api/routes?${params}`)
      if (!res.ok) throw new Error('Failed to fetch route units')
      return res.json()
    },
    enabled: !!city && !!route,
    staleTime: STALE_TIMES.DELIVERY,
  })
}

export function useRevokeAssignment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/assignments?id=${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to revoke assignment')
      }
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assignment-list'] })
      qc.invalidateQueries({ queryKey: ['assignment-totals'] })
      qc.invalidateQueries({ queryKey: ['uc-stats'] })
      qc.invalidateQueries({ queryKey: ['unassigned-bills'] })
      qc.invalidateQueries({ queryKey: ['staff-assignment'] })
    },
  })
}

export function useMarkItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: {
      id: string
      status: 'delivered' | 'missed' | 'skipped'
      gps_lat?: number | null
      gps_lng?: number | null
      notes?: string | null
    }) => {
      const res = await fetch('/api/assignments/items', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to mark item')
      }
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff-assignment'] })
      qc.invalidateQueries({ queryKey: ['staff-stats'] })
    },
  })
}

export function useRefreshAssignment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (assignmentId: string) => {
      const res = await fetch('/api/assignments/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignment_id: assignmentId }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to refresh assignment')
      }
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assignment-list'] })
      qc.invalidateQueries({ queryKey: ['assignment-totals'] })
      qc.invalidateQueries({ queryKey: ['uc-stats'] })
    },
  })
}
