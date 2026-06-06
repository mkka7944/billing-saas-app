import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: Request) {
  try {
    const sup = await createClient()
    const { data: { user } } = await sup.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await sup
      .from('profiles')
      .select('roles!inner(name)')
      .eq('id', user.id)
      .single()

    const role = profile?.roles as { name: string } | undefined
    if (!role || (role.name !== 'admin' && role.name !== 'super_admin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { assignment_item_id } = await request.json()
    if (!assignment_item_id) {
      return NextResponse.json({ error: 'assignment_item_id required' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: item, error: findErr } = await (admin.from('assignment_items') as any)
      .select('id, status')
      .eq('id', assignment_item_id)
      .single()

    if (findErr || !item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    if (item.status !== 'processing') {
      return NextResponse.json({ error: 'Only processing items can be accepted' }, { status: 400 })
    }

    const { error: updateErr } = await (admin.from('assignment_items') as any)
      .update({ status: 'delivered' })
      .eq('id', assignment_item_id)

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
