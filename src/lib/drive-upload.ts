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

  const res = await fetch(WEBHOOK_URL, {
    method: 'POST',
    mode: 'cors',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({
      action: 'upload',
      name: filename,
      data: rawBase64,
      surveyId,
      survey_id: surveyId,
      email,
      timestamp: new Date().toISOString(),
    }),
  })

  if (!res.ok) throw new Error(`GAS HTTP ${res.status}`)

  const result: Record<string, unknown> = await res.json()
  if (result.status !== 'success') {
    throw new Error(`GAS returned status="${result.status}"`)
  }

  const fileId =
    (result.fileId as string) ||
    (result.id as string) ||
    (result.file_id as string)
  if (!fileId) throw new Error('No fileId in GAS response')

  return fileId
}
