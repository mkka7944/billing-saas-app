import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const sup = await createClient()

  const { data: { user }, error: authError } = await sup.auth.getUser()
  if (!user || authError) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Profiles with role filter (FK exists: profiles.role_id -> roles.id)
  const { data: profiles, error } = await sup
    .from('profiles')
    .select('id, full_name, username, role_id')
    .is('deleted_at', null)
    .order('full_name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!profiles?.length) return NextResponse.json({ data: [] })

  // Get field_staff role id
  const { data: roleRow } = await sup
    .from('roles')
    .select('id')
    .eq('name', 'field_staff')
    .single()

  const fieldStaffRoleId = roleRow?.id
  if (!fieldStaffRoleId) return NextResponse.json({ data: [] })

  // Filter to field_staff only
  const fieldStaffProfiles = profiles.filter(p => p.role_id === fieldStaffRoleId)

  // Fetch staff rows separately (no FK between profiles and staff)
  const profileIds = fieldStaffProfiles.map(p => p.id)
  const { data: staffRows } = await sup
    .from('staff')
    .select('id, assigned_city, assigned_ucs, assigned_cities, is_active')
    .in('id', profileIds)

  const staffMap = new Map((staffRows || []).map(s => [s.id, s]))

  const result = fieldStaffProfiles.map(p => {
    const staffEntry = staffMap.get(p.id)
    return {
      id: p.id,
      full_name: p.full_name,
      assigned_city: staffEntry?.assigned_city || null,
      assigned_ucs: staffEntry?.assigned_ucs || null,
      assigned_cities: staffEntry?.assigned_cities || null,
      is_active: staffEntry?.is_active ?? true,
    }
  })

  return NextResponse.json({ data: result })
}
