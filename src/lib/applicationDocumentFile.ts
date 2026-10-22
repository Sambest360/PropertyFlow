export type ApplicationDocumentFile = {
  name: string
  mimeType?: string
  dataUrl: string
}

function parseDataUrl(dataUrl: string): { mimeType: string; bytes: Uint8Array } | null {
  const trimmed = dataUrl.trim()
  const match = /^data:([^;,]+)?(?:;base64)?,(.*)$/i.exec(trimmed)
  if (!match) return null
  const mimeType = match[1]?.trim() || 'application/octet-stream'
  const payload = match[2]
  const isBase64 = /;base64/i.test(trimmed.slice(0, trimmed.indexOf(',') + 1))
  try {
    if (isBase64) {
      const binary = atob(payload)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      return { mimeType, bytes }
    }
    const decoded = decodeURIComponent(payload)
    const bytes = new TextEncoder().encode(decoded)
    return { mimeType, bytes }
  } catch {
    return null
  }
}

function blobFromFile(file: ApplicationDocumentFile): Blob | null {
  const parsed = parseDataUrl(file.dataUrl)
  if (!parsed) return null
  const mime = file.mimeType?.trim() || parsed.mimeType
  const { bytes } = parsed
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  return new Blob([buffer], { type: mime })
}

function openBlob(blob: Blob): boolean {
  const url = URL.createObjectURL(blob)
  const win = window.open(url, '_blank', 'noopener')
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return Boolean(win)
}

/** Open an application document in a new tab (works for large PDFs; avoids raw data: navigation). */
export function openApplicationDocumentFile(file: ApplicationDocumentFile): boolean {
  const blob = blobFromFile(file)
  if (!blob) return false
  return openBlob(blob)
}

/** Download an application document with its stored filename. */
export function downloadApplicationDocumentFile(file: ApplicationDocumentFile): boolean {
  const blob = blobFromFile(file)
  if (!blob) return false
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name?.trim() || 'document'
  a.rel = 'noopener'
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
  return true
}
