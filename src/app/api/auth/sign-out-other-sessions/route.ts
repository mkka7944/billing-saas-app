import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST() {
  const sup = await createClient()

  const { data: { user }, error: authError } = await sup.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const supUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

  const res = await fetch(`${supUrl}/auth/v1/admin/users/${user.id}/sessions`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${svcKey}`,
      apikey: svcKey,
    },
  })

  if (!res.ok) {
    const body = await res.text()
    console.error(`sign-out-other-sessions: GoTrue DELETE returned ${res.status}: ${body}`)
    return NextResponse.json({ error: `Failed to revoke sessions: ${res.status} ${body}` }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
