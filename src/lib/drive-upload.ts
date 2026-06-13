import { stripDataPrefix } from './drive'

const WEBHOOK_URL = process.env.NEXT_PUBLIC_DRIVE_WEBHOOK_URL

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export async function uploadToGAS(
  blob: Blob,
  surveyId: string,
  email: string,
): Promise<string> {
  if (!WEBHOOK_URL) throw new Error('DRIVE_WEBHOOK_URL not configured')

  const dataUrl = await blobToBase64(blob)
  const rawBase64 = stripDataPrefix(dataUrl)
  const filename = `${surveyId}_${Date.now()}.webp`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)

  let res: Response
  try {
    res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'text/plain' },
      signal: controller.signal,
      body: JSON.stringify({
        action: 'upload',
        name: filename,
        data: rawBase64,
        surveyId,
        survey_id: surveyId,
        email,
        referer: window.location.origin,
        timestamp: new Date().toISOString(),
      }),
    })
  } catch (e) {
    throw new Error(e instanceof DOMException && e.name === 'AbortError' ? 'GAS timeout (8s)' : 'GAS network error')
  } finally {
    clearTimeout(timeout)
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`GAS HTTP ${res.status}${body ? `: ${body}` : ''}`)
  }

  const result: Record<string, unknown> = await res.json()
  if (result.status !== 'success') {
    const msg = (result.message as string) || `status="${result.status}"`
    throw new Error(`GAS: ${msg}`)
  }

  const fileId =
    (result.fileId as string) ||
    (result.id as string) ||
    (result.file_id as string)
  if (!fileId) throw new Error('No fileId in GAS response')

  return fileId
}
