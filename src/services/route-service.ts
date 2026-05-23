import { createClient } from '@/lib/supabase/server'
import type { SavedRoute, RouteWaypoint } from '@/types'

export async function getRoutes(userId?: string) {
  const supabase = await createClient()
  let query = supabase
    .from('saved_routes')
    .select('*')
    .order('created_at', { ascending: false })

  if (userId) query = query.eq('created_by', userId)

  const { data, error } = await query
  if (error) throw error
  return data as SavedRoute[]
}

export async function getRouteById(id: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('saved_routes')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data as SavedRoute
}

export async function createRoute(params: {
  route_name: string
  created_by: string
  sequence: RouteWaypoint[]
  polygon?: number[][]
}) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('saved_routes')
    .insert({
      route_name: params.route_name,
      created_by: params.created_by,
      route_data: {
        name: params.route_name,
        sequence: params.sequence,
        polygon: params.polygon || null,
        timestamp: new Date().toLocaleString(),
      },
    })
    .select()
    .single()

  if (error) throw error
  return data as SavedRoute
}

export async function updateRoute(id: string, params: {
  route_name?: string
  sequence?: RouteWaypoint[]
  polygon?: number[][]
}) {
  const supabase = await createClient()
  const existing = await getRouteById(id)
  const routeData = {
    ...existing.route_data,
    ...(params.sequence ? { sequence: params.sequence } : {}),
    ...(params.polygon ? { polygon: params.polygon } : {}),
    name: params.route_name || existing.route_name,
  }

  const { data, error } = await supabase
    .from('saved_routes')
    .update({
      route_name: params.route_name || existing.route_name,
      route_data: routeData,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as SavedRoute
}

export async function deleteRoute(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('saved_routes').delete().eq('id', id)
  if (error) throw error
}
