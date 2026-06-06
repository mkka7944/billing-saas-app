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

    const body = await request.json()
    const { user_id, all_staff, title, body: messageBody, link } = body

    if (!title) {
      return NextResponse.json({ error: 'title required' }, { status: 400 })
    }

    const admin = createAdminClient()

    let targets: string[] = []

    if (all_staff) {
      const { data: staffList } = await (admin.from('staff') as any)
        .select('id')
        .is('deleted_at', null)
      targets = (staffList || []).map((s: any) => s.id)
    } else if (user_id) {
      targets = [user_id]
    } else {
      return NextResponse.json({ error: 'Provide user_id or { all_staff: true }' }, { status: 400 })
    }

    if (targets.length === 0) {
      return NextResponse.json({ sent: 0 })
    }

    const rows = targets.map((uid) => ({
      user_id: uid,
      type: 'staff_message' as const,
      title,
      body: messageBody || null,
      link: link || null,
    }))

    const { error: insertErr } = await (admin.from('notifications') as any).insert(rows)

    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

    return NextResponse.json({ sent: targets.length })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
