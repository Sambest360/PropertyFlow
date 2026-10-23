import { useEffect, useState } from 'react'
import { inspectionFileObjectUrl } from '../../lib/inspections/api'

/** One stored inspection photo, loaded with the auth header, with its timestamp. */
export function InspectionPhotoThumb({ url, uploadedAt, label }: { url: string; uploadedAt: string; label: string }) {
  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let objectUrl: string | null = null
    let cancelled = false
    inspectionFileObjectUrl(url)
      .then((next) => {
        objectUrl = next
        if (cancelled) URL.revokeObjectURL(next)
        else setSrc(next)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [url])

  const when = uploadedAt ? new Date(uploadedAt).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' }) : ''
  return (
    <figure className="w-24 shrink-0">
      <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-xl border border-primary-100 bg-primary-50/40">
        {src ? (
          <a href={src} target="_blank" rel="noopener noreferrer">
            <img src={src} alt={label} className="h-24 w-24 object-cover" />
          </a>
        ) : (
          <span className="px-2 text-center text-[11px] text-ink-500">{failed ? 'Not available' : 'Loading'}</span>
        )}
      </div>
      <figcaption className="mt-1 text-[11px] leading-tight text-ink-500">{when}</figcaption>
    </figure>
  )
}
