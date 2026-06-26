import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  try {
    const sp = new URL(request.url).searchParams
    const surveyId = sp.get('survey_id')

    if (!surveyId) {
      return NextResponse.json({ error: 'survey_id required' }, { status: 400 })
    }

    const sup = await createClient()
    const { data: { user } } = await sup.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data, error } = await sup
      .from('survey_units')
      .select('image_urls')
      .eq('survey_id', surveyId)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const imageUrls: string[] = (data?.image_urls || []).filter(Boolean)
    return NextResponse.json({ image_urls: imageUrls })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
