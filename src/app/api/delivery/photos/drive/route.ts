import { NextResponse } from 'next/server'

const WEBHOOK_URL = process.env.NEXT_PUBLIC_DRIVE_WEBHOOK_URL

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams
  const surveyId = sp.get('survey_id')

  if (!surveyId) {
    return NextResponse.json({ error: 'survey_id query param required' }, { status: 400 })
  }

  if (!WEBHOOK_URL) {
    return NextResponse.json({ error: 'DRIVE_WEBHOOK_URL not configured' }, { status: 500 })
  }

  try {
    const resp = await fetch(`${WEBHOOK_URL}?action=get_images&surveyId=${encodeURIComponent(surveyId)}`)
    if (!resp.ok) {
      return NextResponse.json({ error: `Webhook returned ${resp.status}` }, { status: 502 })
    }

    const result = await resp.json()

    if (result.status !== 'success' || !Array.isArray(result.files)) {
      return NextResponse.json({ data: [] })
    }

    const data = result.files.map((f: { id: string; createdTime?: string }) => ({
      id: f.id,
      photo_url: `https://drive.google.com/thumbnail?id=${f.id}&sz=w800`,
      thumbnail_url: `https://drive.google.com/thumbnail?id=${f.id}&sz=w200`,
      captured_at: f.createdTime || null,
    }))

    return NextResponse.json({ data })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }
}
