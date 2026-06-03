import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getFlaggedEntriesBySurvey } from '@/lib/repositories/flagged-psids-repository'

export async function GET(request: Request) {
  try {
    const sp = new URL(request.url).searchParams
    const surveyId = sp.get('survey_id')?.trim()
    const psid = sp.get('psid')?.trim()
    const sup = await createClient()

    const result = await getFlaggedEntriesBySurvey(sup, surveyId, psid)
    return NextResponse.json(result)
  } catch (err) {
    console.error('flagged-psids route error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
