import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST() {
  try {
    const sup = await createClient()
    const { data: { user } } = await sup.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get this user's assignment IDs
    const { data: myAssignments } = await sup
      .from('daily_assignments')
      .select('id')
      .eq('staff_id', user.id)

    if (!myAssignments?.length) {
      return NextResponse.json({ deleted: 0 })
    }

    const assignmentIds = myAssignments.map(a => a.id)

    // Get their assignment_item IDs
    const { data: myItems } = await sup
      .from('assignment_items')
      .select('id')
      .in('assignment_id', assignmentIds)

    if (!myItems?.length) {
      return NextResponse.json({ deleted: 0 })
    }

    const itemIds = myItems.map(i => i.id)

    // Delete orphaned delivery_photos: never uploaded, never verified
    const { data: deleted, error } = await sup
      .from('delivery_photos')
      .delete()
      .in('assignment_item_id', itemIds)
      .eq('synced_to_drive', false)
      .is('photo_url', null)
      .is('verified_by', null)
      .select('id')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ deleted: deleted?.length || 0 })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
