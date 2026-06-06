import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const sup = await createClient()
    const { data: { user } } = await sup.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { id, all } = body

    let query = sup.from('notifications').update({ read: true }).eq('user_id', user.id)

    if (id) {
      query = query.eq('id', id)
    } else if (!all) {
      return NextResponse.json({ error: 'Provide id or { all: true }' }, { status: 400 })
    }

    const { error } = await query

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
