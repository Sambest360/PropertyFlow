import { isApiEnabled } from './api/config'
import { actorHeaders } from './api/actorAuth'
import { resolveApiAuthorizationHeader } from './api/authClient'

/**
 * Save a compressed photo on the server (POST /api/photos) and return its
 * short /api/files link, so rows don't carry ~400 KB base64 strings. If the
 * upload fails the photo is kept inline so nothing is lost.
 */
async function storeViaServer(dataUrl: string): Promise<string> {
  try {
    const apiBase = (import.meta.env.VITE_API_BASE as string | undefined) || ''
    const res = await fetch(`${apiBase}/api/photos`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...actorHeaders(), ...(await resolveApiAuthorizationHeader()) },
      body: JSON.stringify({ dataUrl }),
    })
    if (!res.ok) return dataUrl
    const body = (await res.json()) as { url?: string }
    return typeof body.url === 'string' && body.url ? body.url : dataUrl
  } catch {
    return dataUrl
  }
}

export async function storePhotoDataUrl(dataUrl: string): Promise<string> {
  return isApiEnabled ? storeViaServer(dataUrl) : dataUrl
}
