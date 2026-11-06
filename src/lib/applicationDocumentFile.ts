import { actorHeaders } from './api/actorAuth'
import { authHeaders } from './api/authClient'

export type ApplicationDocumentFile = {
  name: string
  mimeType?: string
  dataUrl: string
  /** Fetched on demand when dataUrl is empty (files are not in the page data). */
  src?: string
}

/** True when the file can be opened: its content is here or can be fetched. */
export function hasDocumentFile(file: Partial<ApplicationDocumentFile> | null | undefined): boolean {
  return Boolean(file && (file.dataUrl || file.src))
}

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) || ''

/** The file with its content, fetching it from the server when needed. */
export async function loadDocumentFile(file: ApplicationDocumentFile): Promise<ApplicationDocumentFile | null> {
  if (file.dataUrl) return file
  if (!file.src) return null
  try {
    const res = await fetch(`${API_BASE}${file.src}`, {
      headers: { ...actorHeaders(), ...authHeaders() },
      credentials: 'include',
    })
    if (!res.ok) return null
    const body = (await res.json()) as { name?: string; mimeType?: string; dataUrl?: string }
    if (!body.dataUrl) return null
    return { name: body.name || file.name, mimeType: body.mimeType || file.mimeType, dataUrl: body.dataUrl }
  } catch {
    return null
  }
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
  // No 'noopener' feature: with it window.open always returns null, so the
  // document opened but the page then showed "could not open" when you came
  // back. Cut the opener link by hand instead.
  const win = window.open(url, '_blank')
  if (win) {
    try {
      win.opener = null
    } catch {
      /* cross-origin: nothing to cut */
    }
  } else {
    // Pop-up blocked (or an installed app): download it rather than fail.
    const a = document.createElement('a')
    a.href = url
    a.target = '_blank'
    a.rel = 'noopener'
    a.click()
  }
  // Keep the blob alive long enough to come back to the tab / reload it.
  window.setTimeout(() => URL.revokeObjectURL(url), 10 * 60_000)
  return true
}

/** Open an application document in a new tab (works for large PDFs; avoids raw data: navigation). */
export function openApplicationDocumentFile(file: ApplicationDocumentFile): boolean {
  if (!file.dataUrl && file.src) {
    // Open the tab now (still inside the click, so it is not blocked), then fill it.
    const win = window.open('', '_blank')
    if (win) {
      try {
        win.document.title = file.name || 'Document'
        win.document.body.textContent = 'Loading the document…'
      } catch {
        /* ignore */
      }
    }
    void loadDocumentFile(file).then((loaded) => {
      const blob = loaded ? blobFromFile(loaded) : null
      if (!blob) {
        if (win) win.close()
        void import('./sweetAlert').then((m) => m.showAuthWarning('Could not open this document. Try again.'))
        return
      }
      const url = URL.createObjectURL(blob)
      if (win) {
        win.location.href = url
        try {
          win.opener = null
        } catch {
          /* ignore */
        }
      } else {
        openBlob(blob)
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 10 * 60_000)
    })
    return true
  }
  const blob = blobFromFile(file)
  if (!blob) return false
  return openBlob(blob)
}

/** Download an application document with its stored filename. */
export function downloadApplicationDocumentFile(file: ApplicationDocumentFile): boolean {
  if (!file.dataUrl && file.src) {
    void loadDocumentFile(file).then((loaded) => {
      if (!loaded || !downloadApplicationDocumentFile(loaded)) void import('./sweetAlert').then((m) => m.showAuthWarning('Could not download this document. Try again.'))
    })
    return true
  }
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
