import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { updateFlaggedEntry } from '@/lib/repositories/flagged-psids-repository'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const sup = await createClient()

    const result = await updateFlaggedEntry(sup, id, {
      resolved: body.resolved,
      notes: body.notes,
      reason: body.reason,
      resolution: body.resolution,
    })

    if ('error' in result) {
      const status = (result as any).status || 400
      return NextResponse.json({ error: result.error }, { status })
    }

    return NextResponse.json({ data: result.data })
  } catch (err) {
    console.error('admin/flagged-psids PATCH error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
