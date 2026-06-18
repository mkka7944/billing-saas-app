import { createClient } from '@/lib/supabase/server'
import { StatsClient } from './stats-client'

export default async function StatsPage() {
  const sup = await createClient()
  const { data: staffList } = await sup
    .from('staff')
    .select('id, full_name, assigned_city, assigned_ucs, assigned_cities, is_active')
    .eq('is_active', true)
    .order('full_name')

  return <StatsClient initialStaffList={staffList || []} />
}
