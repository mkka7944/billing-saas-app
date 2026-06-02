import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const sup = await createClient()

  const { data: { user }, error: authError } = await sup.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { data, error } = await sup
    .from('profiles')
    .select('username, full_name, suspended_at, deleted_at, roles!inner(name)')
    .eq('id', user.id)
    .single()

  if (error) {
    return NextResponse.json({ data: { roleName: 'staff', displayName: null, username: null } })
  }

  const roleName = (data as any)?.roles?.name || (data as any)?.roles?.[0]?.name || 'staff'

  if (data?.deleted_at) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 })
  }

  if (data?.suspended_at) {
    return NextResponse.json({ error: 'Account is frozen. Contact your admin.' }, { status: 403 })
  }

  return NextResponse.json({
    data: {
      roleName,
      displayName: data?.full_name || data?.username || null,
      username: data?.username || null,
    },
  })
}
