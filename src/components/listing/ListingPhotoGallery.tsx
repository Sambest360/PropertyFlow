import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Images, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { cn } from '../ui'
import { usePrefersReducedMotion } from '../../hooks/useScrollMotion'

export function ListingPhotoGallery({
  images,
  title,
}: {
  images: string[]
  title: string
}) {
  const photos = images.length ? images : []
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [index, setIndex] = useState(0)
  const reducedMotion = usePrefersReducedMotion()

  const openAt = (i: number) => {
    if (!photos.length) return
    setIndex(i)
    setLightboxOpen(true)
  }

  const gridExtras =
    photos.length > 1
      ? photos.slice(1, 5)
      : photos[0]
        ? [photos[0], photos[0], photos[0], photos[0]]
        : []

  return (
    <div>
      <div className="relative">
        <div className="grid gap-2 overflow-hidden rounded-3xl sm:h-[420px] sm:grid-cols-4 sm:grid-rows-2">
          <button
            type="button"
            className="group relative cursor-pointer sm:col-span-2 sm:row-span-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
            onClick={() => openAt(0)}
            aria-label={`View photo 1 of ${photos.length}`}
            disabled={!photos.length}
          >
            {photos[0] ? (
              <img
                src={photos[0]}
                alt=""
                width={800}
                height={600}
                fetchPriority="high"
                loading="eager"
                decoding="async"
                className={cn(
                  'h-56 w-full object-cover sm:h-full',
                  !reducedMotion && 'transition-transform duration-300 group-hover:scale-[1.02]',
                )}
              />
            ) : (
              <div className="flex h-56 items-center justify-center bg-primary-100 text-sm text-ink-500 sm:h-full">
                No photos
              </div>
            )}
          </button>
          {gridExtras.map((src, i) => {
            const photoIndex = photos.length > 1 ? i + 1 : 0
            return (
              <button
                key={`${src}-${i}`}
                type="button"
                className="group relative hidden cursor-pointer overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:block"
                onClick={() => openAt(photoIndex)}
                aria-label={`View photo ${photoIndex + 1} of ${photos.length}`}
              >
                <img
                  src={src}
                  alt=""
                  width={400}
                  height={300}
                  loading="lazy"
                  decoding="async"
                  className={cn(
                    'h-full w-full object-cover',
                    !reducedMotion && 'transition-transform duration-300 group-hover:scale-[1.03]',
                  )}
                />
              </button>
            )
          })}
        </div>

        {photos.length > 0 && (
          <button
            type="button"
            onClick={() => openAt(0)}
            className="absolute bottom-3 right-3 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full bg-white/95 px-3.5 text-sm font-semibold text-ink shadow-md shadow-ink/10 backdrop-blur-sm transition-colors duration-200 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Images className="h-4 w-4 text-ink-500" aria-hidden />
            Photos ({photos.length})
          </button>
        )}
      </div>

      {lightboxOpen && photos.length > 0 ? (
        <PhotoLightbox
          photos={photos}
          title={title}
          index={index}
          onIndexChange={setIndex}
          onClose={() => setLightboxOpen(false)}
          reducedMotion={reducedMotion}
        />
      ) : null}
    </div>
  )
}

function PhotoLightbox({
  photos,
  title,
  index,
  onIndexChange,
  onClose,
  reducedMotion,
}: {
  photos: string[]
  title: string
  index: number
  onIndexChange: (n: number) => void
  onClose: () => void
  reducedMotion?: boolean
}) {
  const safeIndex = ((index % photos.length) + photos.length) % photos.length

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') onIndexChange((safeIndex + 1) % photos.length)
      if (e.key === 'ArrowLeft') onIndexChange((safeIndex - 1 + photos.length) % photos.length)
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose, onIndexChange, photos.length, safeIndex])

  const go = (delta: number) => {
    onIndexChange((safeIndex + delta + photos.length) % photos.length)
  }

  return createPortal(
    <div className="fixed inset-0 z-[90] flex flex-col bg-ink/90">
      <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{title}</p>
          <p className="tabular text-xs text-white/70">
            {safeIndex + 1} / {photos.length}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white transition-colors duration-200 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          aria-label="Close photos"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-12 sm:px-16">
        {photos.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              className="absolute left-2 inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:left-4"
              aria-label="Previous photo"
            >
              <ChevronLeft className="h-6 w-6" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              className="absolute right-2 inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:right-4"
              aria-label="Next photo"
            >
              <ChevronRight className="h-6 w-6" aria-hidden />
            </button>
          </>
        )}
        <img
          key={photos[safeIndex]}
          src={photos[safeIndex]}
          alt={`${title} — photo ${safeIndex + 1}`}
          className={cn(
            'max-h-full max-w-full rounded-lg object-contain',
            !reducedMotion && 'animate-fade-in',
          )}
        />
      </div>

      {photos.length > 1 && (
        <div className="flex gap-2 overflow-x-auto px-4 py-3 sm:justify-center sm:px-6">
          {photos.map((src, i) => (
            <button
              key={`${src}-${i}`}
              type="button"
              onClick={() => onIndexChange(i)}
              className={cn(
                'h-14 w-20 shrink-0 cursor-pointer overflow-hidden rounded-lg border-2 transition-opacity duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white',
                i === safeIndex ? 'border-white opacity-100' : 'border-transparent opacity-60 hover:opacity-90',
              )}
              aria-label={`Go to photo ${i + 1}`}
              aria-current={i === safeIndex}
            >
              <img src={src} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body,
  )
}
