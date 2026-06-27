import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST() {
  const sup = await createClient()

  const { data: { user }, error: authError } = await sup.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const admin = createAdminClient()
  const { error: signOutError } = await (admin.auth as any).admin.signOut(user.id)

  if (signOutError) {
    return NextResponse.json({ error: signOutError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
