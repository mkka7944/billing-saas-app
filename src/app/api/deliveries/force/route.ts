import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: Request) {
  try {
    const { psid } = await request.json()
    if (!psid || typeof psid !== 'string') {
      return NextResponse.json({ error: 'psid required' }, { status: 400 })
    }

    const sup = await createClient()
    const { data: { user } } = await sup.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await sup
      .from('profiles')
      .select('roles!inner(name)')
      .eq('id', user.id)
      .single()

    const role = profile?.roles as { name: string } | undefined
    if (!role || (role.name !== 'admin' && role.name !== 'super_admin')) {
      return NextResponse.json({ error: 'Forbidden: admin required' }, { status: 403 })
    }

    const admin = createAdminClient()
    const { data: items, error: findErr } = await (admin.from('assignment_items') as any)
      .select('id')
      .eq('psid', psid)
      .in('status', ['pending', 'processing'])
      .order('delivered_at', { ascending: false, nullsFirst: true })
      .limit(1)

    if (findErr) {
      return NextResponse.json({ error: `Lookup failed: ${findErr.message}` }, { status: 500 })
    }

    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'No pending/processing item found for this PSID' }, { status: 404 })
    }

    const { error: updateErr } = await (admin.from('assignment_items') as any)
      .update({ status: 'delivered', delivered_at: new Date().toISOString() })
      .eq('id', items[0].id)

    if (updateErr) {
      return NextResponse.json({ error: `Update failed: ${updateErr.message}` }, { status: 500 })
    }

    return NextResponse.json({ success: true, id: items[0].id, status: 'delivered' })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
