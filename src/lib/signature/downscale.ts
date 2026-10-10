/** CR10: client-only downscale (DOM canvas); kept out of the server graph. */
import { SIGNATURE_MAX_BYTES, SIGNATURE_PNG_PREFIX, isValidSignatureDataUrl } from './signatureImage'

/**
 * Client-side downscale: redraw the image smaller until the PNG data URL fits
 * the cap. Returns null when it cannot be made to fit (or in a non-DOM env).
 */
export async function downscaleSignature(
  dataUrl: string,
  opts: { maxBytes?: number; maxWidth?: number; maxHeight?: number; attempts?: number } = {},
): Promise<string | null> {
  const maxBytes = opts.maxBytes ?? SIGNATURE_MAX_BYTES
  if (!dataUrl.startsWith(SIGNATURE_PNG_PREFIX)) return null
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return isValidSignatureDataUrl(dataUrl) && dataUrl.length <= maxBytes ? dataUrl : null
  }
  const img = await new Promise<HTMLImageElement | null>((resolve) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => resolve(null)
    el.src = dataUrl
  })
  if (!img || !img.width || !img.height) return null
  // Fit inside 600x200 first (spec), then shrink further if still over the cap.
  const fit = Math.min(1, (opts.maxWidth ?? 600) / img.width, (opts.maxHeight ?? 200) / img.height)
  let width = img.width * fit
  const attempts = opts.attempts ?? 6
  for (let i = 0; i < attempts; i++) {
    const height = Math.max(1, Math.round((img.height * width) / img.width))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(width))
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const out = canvas.toDataURL('image/png')
    if (out.length <= maxBytes && isValidSignatureDataUrl(out)) return out
    width = width * 0.75
  }
  return null
}
