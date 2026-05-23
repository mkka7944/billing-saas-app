'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { SavedRoute, RouteWaypoint } from '@/types'

export function useBillingRoutes(userId?: string) {
  return useQuery({
    queryKey: ['billing-routes', userId],
    queryFn: async () => {
      const supabase = createClient()
      let query = supabase
        .from('saved_routes')
        .select('*')
        .order('created_at', { ascending: false })

      if (userId) query = query.eq('created_by', userId)

      const { data, error } = await query
      if (error) throw error
      return data as SavedRoute[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateRoute() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      route_name: string
      created_by: string
      sequence: RouteWaypoint[]
    }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('saved_routes')
        .insert({
          route_name: params.route_name,
          created_by: params.created_by,
          route_data: {
            name: params.route_name,
            sequence: params.sequence,
            timestamp: new Date().toLocaleString(),
          },
        })
        .select()
        .single()

      if (error) throw error
      return data as SavedRoute
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing-routes'] })
    },
  })
}

export function useDeleteRoute() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { error } = await supabase.from('saved_routes').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing-routes'] })
    },
  })
}
