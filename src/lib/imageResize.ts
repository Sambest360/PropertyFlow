/**
 * Shrink a picked image before upload: profile photos are cropped to a
 * centred square, logos keep their shape. Output is JPEG (PNG for logos, to
 * keep transparency) and stays well under MAX_PHOTO_BYTES.
 */
import { MAX_PHOTO_BYTES } from './photoLimits'

export type ResizeOptions = { maxEdge: number; square?: boolean; keepPng?: boolean }

export const AVATAR_RESIZE: ResizeOptions = { maxEdge: 320, square: true }
export const LOGO_RESIZE: ResizeOptions = { maxEdge: 480, keepPng: true }

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export async function resizeImageFile(file: File, opts: ResizeOptions): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file (JPEG, PNG or WebP).')
  const raw = await readAsDataUrl(file)
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error('This image could not be read. Try a JPEG or PNG.'))
    el.src = raw
  })
  const side = Math.min(img.width, img.height)
  const sx = opts.square ? (img.width - side) / 2 : 0
  const sy = opts.square ? (img.height - side) / 2 : 0
  const sw = opts.square ? side : img.width
  const sh = opts.square ? side : img.height
  const scale = Math.min(1, opts.maxEdge / Math.max(sw, sh))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(sw * scale))
  canvas.height = Math.max(1, Math.round(sh * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Your browser could not resize this image.')
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
  if (opts.keepPng && file.type === 'image/png') {
    const png = canvas.toDataURL('image/png')
    if (png.length * 0.75 <= MAX_PHOTO_BYTES) return png
  }
  for (const q of [0.85, 0.75, 0.6]) {
    const out = canvas.toDataURL('image/jpeg', q)
    if (out.length * 0.75 <= MAX_PHOTO_BYTES) return out
  }
  throw new Error('This image is too large. Try a smaller one.')
}
