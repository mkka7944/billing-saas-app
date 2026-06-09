export function stripDataPrefix(dataUrl: string): string {
  const idx = dataUrl.indexOf(',')
  return idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl
}

export function extractFileId(res: Record<string, unknown>): string | null {
  return (
    (res.fileId as string) ||
    (res.id as string) ||
    (res.file_id as string) ||
    ((res.data as Record<string, unknown>)?.id as string) ||
    ((res.data as Record<string, unknown>)?.fileId as string) ||
    null
  )
}
