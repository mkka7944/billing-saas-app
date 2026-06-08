import { NextResponse } from 'next/server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const { fileId } = await params

  if (!fileId || fileId.length < 10) {
    return NextResponse.json({ error: 'Invalid fileId' }, { status: 400 })
  }

  const upstream = `https://lh3.googleusercontent.com/d/${fileId}`

  try {
    const resp = await fetch(upstream, { signal: AbortSignal.timeout(8000) })

    if (!resp.ok) {
      return NextResponse.json({ error: `Upstream returned ${resp.status}` }, { status: 502 })
    }

    const contentType = resp.headers.get('content-type') || 'image/jpeg'
    const buffer = Buffer.from(await resp.arrayBuffer())

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(buffer.length),
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Upstream fetch failed' }, { status: 502 })
  }
}
