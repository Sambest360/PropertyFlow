/**
 * P3b: browser-only image downscale for application documents. Kept out of
 * applicationDocUpload.ts so the canvas code never enters the API build.
 * JPEG and PNG go to a 2000 px long edge as JPEG; PDFs are not touched.
 */
import { dataUrlBytes } from './applicationDocUpload'

export const DOC_IMAGE_MAX_EDGE_PX = 2000
export const DOC_IMAGE_JPEG_QUALITIES = [0.82, 0.72, 0.62] as const

export type ReadDocFile = { name: string; mimeType: string; dataUrl: string; bytes: number }

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function jpegName(name: string): string {
  return /\.(png|jpe?g)$/i.test(name) ? name.replace(/\.(png|jpe?g)$/i, '.jpg') : `${name}.jpg`
}

/** Read a document; images are downscaled and re-encoded. `bytes` is the size after that. */
export async function readDocumentFile(file: File, targetBytes: number): Promise<ReadDocFile> {
  const raw = await readAsDataUrl(file)
  const mimeType = file.type || 'application/octet-stream'
  const original = { name: file.name, mimeType, dataUrl: raw, bytes: file.size }
  if (mimeType !== 'image/jpeg' && mimeType !== 'image/png') return original
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('decode failed'))
      el.src = raw
    })
    const scale = Math.min(1, DOC_IMAGE_MAX_EDGE_PX / Math.max(img.width, img.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.width * scale))
    canvas.height = Math.max(1, Math.round(img.height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) return original
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    let best = original
    for (const q of DOC_IMAGE_JPEG_QUALITIES) {
      const out = canvas.toDataURL('image/jpeg', q)
      const bytes = dataUrlBytes(out)
      if (bytes < best.bytes) best = { name: jpegName(file.name), mimeType: 'image/jpeg', dataUrl: out, bytes }
      if (bytes <= targetBytes) break
    }
    return best
  } catch {
    return original
  }
}
