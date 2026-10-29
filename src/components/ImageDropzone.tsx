import { useCallback, useId, useRef, useState, type DragEvent } from 'react'
import { GripVertical, ImagePlus, Upload, X } from 'lucide-react'
import { cn } from './ui'
import { LISTING_PHOTO_TOO_LARGE, partitionPhotosBySize } from '../lib/listingPhotos'
import { storePhotoDataUrl } from '../lib/photoStorage'

const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/heic,image/*'

/**
 * Photos are downscaled and re-encoded first (the size cap is measured on the
 * compressed data URL), then uploaded to the server so rows carry a
 * short public URL. Without Storage they stay inline as data URLs, which
 * bloats every DB row and payload that carries them.
 */
const MAX_EDGE_PX = 1600
const TARGET_MAX_CHARS = 450_000
const JPEG_QUALITIES = [0.82, 0.7, 0.6]

async function compressToDataUrl(file: File): Promise<string> {
  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
  // Animation/transparency formats: keep as-is rather than re-encode badly.
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') return rawDataUrl
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('image decode failed'))
      el.src = rawDataUrl
    })
    const scale = Math.min(1, MAX_EDGE_PX / Math.max(img.width, img.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.width * scale))
    canvas.height = Math.max(1, Math.round(img.height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) return rawDataUrl
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    for (const quality of JPEG_QUALITIES) {
      const out = canvas.toDataURL('image/jpeg', quality)
      if (out.length <= TARGET_MAX_CHARS || quality === JPEG_QUALITIES[JPEG_QUALITIES.length - 1]) {
        return out
      }
    }
    return rawDataUrl
  } catch {
    return rawDataUrl
  }
}

async function readFilesAsDataUrls(files: FileList | File[]): Promise<string[]> {
  const list = Array.from(files).filter((f) => f.type.startsWith('image/'))
  return Promise.all(list.map((file) => compressToDataUrl(file)))
}

function reorderList<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
    return items
  }
  const next = [...items]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

export type ImageDropzoneProps = {
  /** Current image data URLs / sources */
  value: string[]
  onChange: (next: string[]) => void
  /** Allow selecting multiple files (default true) */
  multiple?: boolean
  /** Max images allowed (undefined = unlimited) */
  max?: number
  label?: string
  hint?: string
  className?: string
  /** Compact single-slot for hero/cover */
  variant?: 'gallery' | 'cover'
  disabled?: boolean
  /** Drag thumbnails to set gallery order (first image = cover) */
  reorderable?: boolean
  /** Refuse any photo still larger than this after downscaling (data URL length). */
  maxBytes?: number
}

/**
 * Click or drag-and-drop image picker. Stores compressed images on the server (short /api/files links),
 * falling back to inline data URLs when Storage is unavailable.
 */
export function ImageDropzone({
  value,
  onChange,
  multiple = true,
  max,
  label = 'Photos',
  hint = 'Drag & drop images here, or click to browse your gallery',
  className,
  variant = 'gallery',
  disabled,
  reorderable = false,
  maxBytes,
}: ImageDropzoneProps) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const [uploading, setUploading] = useState(false)

  const remaining = max == null ? Infinity : Math.max(0, max - value.length)
  const canAdd = !disabled && remaining > 0

  const addFiles = useCallback(
    async (files: FileList | File[] | null) => {
      if (!files || !canAdd) return
      setError(null)
      try {
        const all = await readFilesAsDataUrls(files)
        if (all.length === 0) {
          setError('Choose an image file (JPEG, PNG, WebP, or GIF).')
          return
        }
        const { ok: urls, refused } = maxBytes ? partitionPhotosBySize(all, maxBytes) : { ok: all, refused: 0 }
        if (refused > 0) setError(LISTING_PHOTO_TOO_LARGE)
        if (urls.length === 0) return
        const room = multiple ? (max == null ? urls.length : Math.max(0, max - value.length)) : 1
        setUploading(true)
        const stored = await Promise.all(urls.slice(0, room).map(storePhotoDataUrl))
        onChange(multiple ? [...value, ...stored] : [stored[0]])
      } catch {
        setError('Could not read that file. Try another image.')
      } finally {
        setUploading(false)
      }
    },
    [canAdd, max, maxBytes, multiple, onChange, value],
  )

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragging(false)
    if (!canAdd) return
    void addFiles(e.dataTransfer.files)
  }

  const removeAt = (index: number) => {
    onChange(value.filter((_, i) => i !== index))
  }

  const finishReorder = (from: number, to: number) => {
    setDragIndex(null)
    setDropIndex(null)
    if (from === to) return
    onChange(reorderList(value, from, to))
  }

  const dropZone = (
    <label
      htmlFor={inputId}
      onDragEnter={(e) => {
        e.preventDefault()
        if (canAdd) setDragging(true)
      }}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = canAdd ? 'copy' : 'none'
      }}
      onDragLeave={(e) => {
        e.preventDefault()
        if (e.currentTarget.contains(e.relatedTarget as Node)) return
        setDragging(false)
      }}
      onDrop={onDrop}
      className={cn(
        'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors duration-200',
        canAdd
          ? dragging
            ? 'border-primary bg-primary-50 text-primary'
            : 'border-primary-200 bg-primary-50/40 text-ink-500 hover:border-primary hover:bg-primary-50 hover:text-primary'
          : 'cursor-not-allowed border-primary-100 bg-surface-muted text-ink-400 opacity-70',
        variant === 'cover' && 'min-h-[10rem]',
        'focus-within:outline-none focus-within:ring-2 focus-within:ring-primary',
      )}
    >
      <span
        className={cn(
          'inline-flex h-12 w-12 items-center justify-center rounded-full',
          dragging ? 'bg-primary text-white' : 'bg-white text-primary shadow-sm',
        )}
        aria-hidden
      >
        {dragging ? (
          <Upload className="h-5 w-5" strokeWidth={1.6} />
        ) : (
          <ImagePlus className="h-5 w-5" strokeWidth={1.6} />
        )}
      </span>
      <span className="text-sm font-semibold text-ink">
        {dragging ? 'Drop to upload' : multiple ? 'Add photos' : 'Choose a photo'}
      </span>
      <span className="max-w-xs text-xs text-ink-400">{uploading ? 'Uploading…' : hint}</span>
      {max != null && (
        <span className="tabular text-[11px] text-ink-400">
          {value.length} / {max}
        </span>
      )}
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={ACCEPT}
        multiple={multiple && remaining > 1}
        disabled={!canAdd}
        className="sr-only"
        onChange={(e) => {
          void addFiles(e.target.files)
          e.target.value = ''
        }}
      />
    </label>
  )

  return (
    <div className={cn('space-y-3', className)}>
      {label ? <p className="text-xs font-medium text-ink-500">{label}</p> : null}

      {reorderable && value.length > 1 ? (
        <p className="text-xs text-ink-400">Drag photos to set display order. The first photo is the cover.</p>
      ) : null}

      {value.length > 0 && (
        <ul
          className={cn(
            'grid gap-2',
            variant === 'cover' ? 'grid-cols-1' : 'grid-cols-3 sm:grid-cols-4',
          )}
        >
          {value.map((src, i) => (
            <li
              key={src}
              draggable={reorderable && !disabled}
              onDragStart={(e) => {
                if (!reorderable || disabled) return
                setDragIndex(i)
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/plain', String(i))
              }}
              onDragOver={(e) => {
                if (!reorderable || dragIndex == null) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                setDropIndex(i)
              }}
              onDragLeave={() => {
                if (dropIndex === i) setDropIndex(null)
              }}
              onDrop={(e) => {
                if (!reorderable || dragIndex == null) return
                e.preventDefault()
                e.stopPropagation()
                finishReorder(dragIndex, i)
              }}
              onDragEnd={() => {
                setDragIndex(null)
                setDropIndex(null)
              }}
              className={cn(
                'group relative overflow-hidden rounded-xl ring-1 ring-primary-100',
                variant === 'cover' ? 'aspect-[16/9]' : 'aspect-square',
                reorderable && !disabled && 'cursor-grab active:cursor-grabbing',
                dragIndex === i && 'opacity-60',
                dropIndex === i && dragIndex != null && dragIndex !== i && 'ring-2 ring-primary',
              )}
            >
              <img src={src} alt="" className="h-full w-full object-cover" draggable={false} />
              {reorderable && !disabled ? (
                <span className="absolute left-1.5 top-1.5 inline-flex min-h-8 min-w-8 items-center justify-center rounded-full bg-ink/70 text-white">
                  <GripVertical className="h-4 w-4" aria-hidden />
                </span>
              ) : null}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeAt(i)}
                  className="absolute right-1.5 top-1.5 inline-flex min-h-9 min-w-9 cursor-pointer items-center justify-center rounded-full bg-ink/70 text-white opacity-100 transition-opacity duration-200 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:opacity-0 sm:group-hover:opacity-100"
                  aria-label={`Remove photo ${i + 1}`}
                >
                  <X className="h-4 w-4" strokeWidth={1.6} />
                </button>
              )}
              {i === 0 && value.length > 0 && (reorderable || (variant === 'cover' && value.length > 1)) ? (
                <span className="absolute bottom-2 left-2 rounded-md bg-ink/70 px-2 py-0.5 text-[10px] font-semibold text-white">
                  Cover
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canAdd && dropZone}

      {error && (
        <p role="alert" className="text-xs font-medium text-accent">
          {error}
        </p>
      )}
    </div>
  )
}

/** Single-image helper for forms that only need one photo. */
export function ImageCoverField({
  value,
  onChange,
  label = 'Cover photo',
  className,
}: {
  value: string | null | undefined
  onChange: (next: string | null) => void
  label?: string
  className?: string
}) {
  return (
    <ImageDropzone
      className={className}
      label={label}
      value={value ? [value] : []}
      onChange={(next) => onChange(next[0] ?? null)}
      multiple={false}
      max={1}
      variant="cover"
      hint="Drag & drop a photo, or click to open your gallery"
    />
  )
}
