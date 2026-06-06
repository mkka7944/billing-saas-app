import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  try {
    const sup = await createClient()
    const { data: { user } } = await sup.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const limit = Math.min(Number(searchParams.get('limit')) || 20, 100)
    const offset = Math.max(Number(searchParams.get('offset')) || 0, 0)

    // Fetch notifications
    const { data: notifications, error } = await sup
      .from('notifications')
      .select('id, user_id, type, title, body, link, read, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Count unread
    const { count: unreadCount, error: countErr } = await sup
      .from('notifications')
      .select('*', { head: true, count: 'exact' })
      .eq('user_id', user.id)
      .eq('read', false)

    if (countErr) return NextResponse.json({ error: countErr.message }, { status: 500 })

    // Check admin role for summary
    const { data: profile } = await sup
      .from('profiles')
      .select('roles!inner(name)')
      .eq('id', user.id)
      .single()

    const role = (profile?.roles as { name: string } | undefined)?.name
    const isAdmin = role === 'admin' || role === 'super_admin'

    let summary = null
    if (isAdmin) {
      const { count: pending } = await sup
        .from('assignment_items')
        .select('*', { head: true, count: 'exact' })
        .eq('status', 'pending')

      const { count: processing } = await sup
        .from('assignment_items')
        .select('*', { head: true, count: 'exact' })
        .eq('status', 'processing')

      summary = { pending: pending ?? 0, processing: processing ?? 0 }

      // Auto-create admin_alert if items need attention and no unread alert exists
      const totalNeeding = (pending ?? 0) + (processing ?? 0)
      if (totalNeeding > 0) {
        const { count: existingAlerts } = await sup
          .from('notifications')
          .select('*', { head: true, count: 'exact' })
          .eq('user_id', user.id)
          .eq('type', 'admin_alert')
          .eq('read', false)

        if (!existingAlerts || existingAlerts === 0) {
          await sup.from('notifications').insert({
            user_id: user.id,
            type: 'admin_alert',
            title: `${totalNeeding} item${totalNeeding > 1 ? 's' : ''} need attention`,
            body: `${processing ?? 0} processing, ${pending ?? 0} pending`,
            link: '/settings?tab=delivery',
          })
        }
      }
    }

    return NextResponse.json({
      notifications: notifications || [],
      unread_count: unreadCount ?? 0,
      summary,
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
