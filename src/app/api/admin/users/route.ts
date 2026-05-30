import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { toEmail } from '@/lib/utils'

export async function GET() {
  try {
    const sup = await createClient()

    const { data, error } = await sup
      .from('profiles')
      .select('id, username, full_name, suspended_at, deleted_at, updated_at, roles!inner(name)')
      .order('updated_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const users = (data || []).map((p) => {
      const r = p.roles as { name: string } | { name: string }[]
      const roleName = Array.isArray(r) ? r[0]?.name : r?.name
      return {
        id: p.id,
        username: p.username,
        displayName: p.full_name,
        roleName: roleName || 'unknown',
        suspendedAt: p.suspended_at,
        deletedAt: p.deleted_at,
        createdAt: p.updated_at,
      }
    })

    return NextResponse.json({ data: users })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { username, password, displayName, roleName } = await req.json()

    if (!username || !password || !roleName) {
      return NextResponse.json({ error: 'username, password, and roleName are required' }, { status: 400 })
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    }

    const admin = createAdminClient()
    const sup = await createClient()

    // Check unique username
    const { data: existing } = await sup
      .from('profiles')
      .select('id')
      .eq('username', username)
      .is('deleted_at', null)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ error: 'Username already taken' }, { status: 409 })
    }

    // Look up role_id
    const { data: roleRow } = await sup
      .from('roles')
      .select('id')
      .eq('name', roleName)
      .single()

    if (!roleRow) {
      return NextResponse.json({ error: `Role '${roleName}' not found` }, { status: 400 })
    }

    const email = toEmail(username)

    // Create auth user
    const { data: authUser, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { username, display_name: displayName || null },
    })

    if (createError) {
      return NextResponse.json({ error: createError.message }, { status: 500 })
    }

    const userId = authUser.user.id

    // Upsert profile row
    const { error: profileError } = await sup
      .from('profiles')
      .upsert({
        id: userId,
        username,
        full_name: displayName || username,
        role_id: roleRow.id,
      }, { onConflict: 'id' })

    if (profileError) {
      // Rollback auth user on profile failure
      await admin.auth.admin.deleteUser(userId)
      return NextResponse.json({ error: profileError.message }, { status: 500 })
    }

    return NextResponse.json({
      data: { username, password },
      message: `User '${username}' created successfully. Password shown once.`,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
