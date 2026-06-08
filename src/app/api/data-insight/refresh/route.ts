import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { currentMonth } from '@/lib/constants'

export async function POST(request: Request) {
  try {
    const sup = await createClient()
    const { data: { user }, error: authError } = await sup.auth.getUser()
    if (!user || authError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await sup
      .from('profiles')
      .select('roles!inner(name)')
      .eq('id', user.id)
      .single()

    const role = profile?.roles as { name: string } | undefined
    if (!role || (role.name !== 'admin' && role.name !== 'super_admin')) {
      return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const month = (body.month as string) || currentMonth()

    const admin = createAdminClient()
    const { error: rpcErr } = await (admin as any).rpc('refresh_hierarchy_summary', { p_month: month })

    if (rpcErr) {
      return NextResponse.json({ error: `Refresh failed: ${rpcErr.message}` }, { status: 500 })
    }

    return NextResponse.json({ success: true, month })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
