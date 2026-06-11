import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { photoId } = body as { photoId: string }

    if (!photoId) {
      return NextResponse.json({ error: 'photoId required' }, { status: 400 })
    }

    // Auth + role check via server client (reads session cookies)
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
      return NextResponse.json({ error: 'Forbidden — admin required' }, { status: 403 })
    }

    // Write via admin client (service_role, bypasses RLS)
    const admin = createAdminClient()
    const now = new Date().toISOString()

    const { error } = await (admin.from('delivery_photos') as any)
      .update({
        verified_by: user.id,
        verified_at: now,
      })
      .eq('id', photoId)
      .is('verified_by', null)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, verified_at: now })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
