import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { currentMonth, today } from '@/lib/constants'
import { validateQuery } from '@/lib/validation/validate-query'
import { assignmentQuerySchema } from '@/lib/validation/schemas'
import {
  getUcTotals, getAssignmentList, getUnassignedBills,
  getStaffAssignment, createAssignment, deleteAssignment,
} from '@/lib/repositories/assignment-repository'

export async function GET(request: Request) {
  const params = validateQuery(request, assignmentQuerySchema)
  if (params instanceof NextResponse) return params

  const date = params.date || today()
  const month = params.month || currentMonth()
  const sup = await createClient()

  const assignmentParams = {
    uc: params.uc,
    staffId: params.staff_id,
    totals: params.totals,
    list: params.list,
    district: params.district,
    tehsil: params.tehsil,
    routeName: params.route_name,
    date,
    month,
  }

  if (params.totals) {
    const result = await getUcTotals(sup, assignmentParams)
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: 500 })
    return NextResponse.json(result)
  }

  if (params.list) {
    const result = await getAssignmentList(sup, assignmentParams)
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: 500 })
    return NextResponse.json(result)
  }

  if (params.uc) {
    const result = await getUnassignedBills(sup, assignmentParams)
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: 500 })
    return NextResponse.json(result)
  }

  if (params.staff_id) {
    const result = await getStaffAssignment(sup, assignmentParams)
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: 500 })
    return NextResponse.json(result)
  }

  return NextResponse.json({ error: 'Provide uc=, staff_id=, list=true or totals=true' }, { status: 400 })
}

export async function POST(request: Request) {
  const body = await request.json()
  const sup = await createClient()
  const result = await createAssignment(sup, body)
  if ('error' in result) {
    const status = (result as any).status || 400
    return NextResponse.json({ error: result.error }, { status })
  }
  return NextResponse.json(result, { status: 201 })
}

export async function DELETE(request: Request) {
  const sp = new URL(request.url).searchParams
  const id = sp.get('id')
  const sup = await createClient()
  const result = await deleteAssignment(sup, id || '')
  if ('error' in result) {
    const status = (result as any).status || 400
    return NextResponse.json({ error: result.error }, { status })
  }
  return NextResponse.json(result)
}
