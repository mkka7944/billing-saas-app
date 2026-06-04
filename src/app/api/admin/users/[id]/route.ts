import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const sup = await createClient()
    const admin = createAdminClient()

    const updates: Record<string, unknown> = {}
    let signOutUser = false

    // Update display name
    if ('displayName' in body) {
      updates.full_name = body.displayName
    }

    // Update role
    if ('roleName' in body) {
      const { data: roleRow } = await sup
        .from('roles')
        .select('id')
        .eq('name', body.roleName)
        .single()
      if (!roleRow) {
        return NextResponse.json({ error: `Role '${body.roleName}' not found` }, { status: 400 })
      }
      updates.role_id = roleRow.id
    }

    // Freeze / unfreeze
    if ('suspendedAt' in body) {
      updates.suspended_at = body.suspendedAt
      if (body.suspendedAt) signOutUser = true
    }

    // Reset password
    if ('password' in body) {
      if (body.password.length < 6) {
        return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
      }
      const { error: pwError } = await admin.auth.admin.updateUserById(id, {
        password: body.password,
      })
      if (pwError) {
        return NextResponse.json({ error: pwError.message }, { status: 500 })
      }
    }

    // Apply profile updates
    if (Object.keys(updates).length > 0) {
      const { error: profileError } = await sup
        .from('profiles')
        .update(updates)
        .eq('id', id)

      if (profileError) {
        return NextResponse.json({ error: profileError.message }, { status: 500 })
      }
    }

    // Update assigned city
    if ('assignedCity' in body) {
      const { error: cityError } = await (admin.from('staff') as any)
        .upsert({
          id,
          assigned_city: body.assignedCity || null,
          is_active: true,
        }, { onConflict: 'id' })

      if (cityError) {
        return NextResponse.json({ error: cityError.message }, { status: 500 })
      }
    }

    // Sign out user if frozen
    if (signOutUser) {
      await admin.auth.admin.signOut(id)
    }

    return NextResponse.json({ data: { id }, message: 'User updated' })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { searchParams } = new URL(req.url)
    const restore = searchParams.get('restore') === 'true'
    const sup = await createClient()
    const admin = createAdminClient()

    if (restore) {
      // Restore soft-deleted user
      const { error } = await sup
        .from('profiles')
        .update({ deleted_at: null })
        .eq('id', id)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ data: { id }, message: 'User restored' })
    }

    // Soft delete: set deleted_at and sign out
    const { error } = await sup
      .from('profiles')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    await admin.auth.admin.signOut(id)

    return NextResponse.json({ data: { id }, message: 'User deleted' })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
