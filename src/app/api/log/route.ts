import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const LOG_COLS = 'id, level, user_id, message, details, source, created_at'

export async function DELETE(request: Request) {
  try {
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

    const role = (profile?.roles as { name: string } | undefined)?.name
    if (role !== 'admin' && role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const admin = createAdminClient()
    const { error: delErr } = await (admin.from('app_error_log') as any).delete().gte('id', 0)

    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { level, message, details, source } = body as {
      level?: string
      message: string
      details?: unknown
      source?: string
    }

    if (!message) {
      return NextResponse.json({ error: 'message required' }, { status: 400 })
    }

    const sup = await createClient()
    const { data: { user } } = await sup.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { error: insertErr } = await sup
      .from('app_error_log')
      .insert({
        level: level === 'warn' ? 'warn' : 'error',
        user_id: user.id,
        message,
        details: details ?? null,
        source: source ?? null,
      })

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 })
    }

    return NextResponse.json({ success: true }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function GET(request: Request) {
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

    const role = (profile?.roles as { name: string } | undefined)?.name
    const isAdmin = role === 'admin' || role === 'super_admin'

    const sp = new URL(request.url).searchParams
    const limit = Math.min(parseInt(sp.get('limit') || '50', 10), 200)
    const offset = parseInt(sp.get('offset') || '0', 10)
    const level = sp.get('level')
    const source = sp.get('source')
    const userId = sp.get('user_id')

    let query = sup.from('app_error_log').select(LOG_COLS, { count: 'exact' })

    // Staff sees own logs only; admin can see all or filter by user
    if (!isAdmin) {
      query = query.eq('user_id', user.id)
    } else if (userId) {
      query = query.eq('user_id', userId)
    }

    if (level) query = query.eq('level', level)
    if (source) {
      if (source.startsWith('!')) {
        query = query.not('source', 'in', `(${source.slice(1)})`)
      } else {
        query = query.in('source', source.split(','))
      }
    }

    const { data, count, error } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data: data || [], total: count ?? 0 })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
