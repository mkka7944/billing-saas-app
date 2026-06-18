import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { refreshAssignment } from '@/lib/repositories/assignment-repository'

export async function POST(request: Request) {
  const body = await request.json()
  const { assignment_id } = body
  if (!assignment_id) {
    return NextResponse.json({ error: 'assignment_id required' }, { status: 400 })
  }
  const sup = await createClient()
  const result = await refreshAssignment(sup, assignment_id)
  if ('error' in result) {
    const status = (result as any).status || 400
    return NextResponse.json({ error: result.error }, { status })
  }
  return NextResponse.json(result)
}
