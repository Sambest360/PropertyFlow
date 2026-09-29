import { useEffect, useState, type AnchorHTMLAttributes, type ImgHTMLAttributes, type ReactNode } from 'react'
import { SIGNED_URL_REFRESH_LEAD_MS, isDirectMediaUrl } from '../../lib/storage/contract'
import { resolveMediaSrc, type ResolvedMedia } from '../../lib/storage/resolve'
import { cn } from '../ui'

function initialMedia(src: string | null | undefined): ResolvedMedia {
  if (!src?.trim()) return { status: 'empty', url: null }
  if (isDirectMediaUrl(src.trim())) return { status: 'ready', url: src.trim(), source: 'legacy' }
  return { status: 'loading', url: null }
}

export function useMediaUrl(src: string | null | undefined, legacyFallback?: string | null): ResolvedMedia {
  const [state, setState] = useState<ResolvedMedia>(() => initialMedia(src))

  useEffect(() => {
    let cancelled = false
    const immediate = initialMedia(src)
    if (immediate.status !== 'loading') {
      setState(immediate)
      return
    }
    setState(immediate)
    void resolveMediaSrc(src, { legacyFallback }).then((next) => {
      if (!cancelled) setState(next)
    })
    return () => {
      cancelled = true
    }
  }, [src, legacyFallback])

  useEffect(() => {
    if (state.status !== 'ready' || !state.expiresAt) return
    const wait = Date.parse(state.expiresAt) - Date.now() - SIGNED_URL_REFRESH_LEAD_MS
    const timer = window.setTimeout(() => {
      void resolveMediaSrc(src, { legacyFallback }).then(setState)
    }, Math.max(0, wait))
    return () => window.clearTimeout(timer)
  }, [state.status, state.expiresAt, src, legacyFallback])

  return state
}

type MediaImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src?: string | null
  /** Used when a storage ref 403s or 404s but the row still has a data URL. */
  legacyFallback?: string | null
}

/** Image that renders a data URL, remote URL, or a refreshed signed URL. */
export function MediaImage({ src, legacyFallback, alt = '', className, ...rest }: MediaImageProps) {
  const media = useMediaUrl(src, legacyFallback)
  const [broken, setBroken] = useState(false)

  useEffect(() => {
    setBroken(false)
  }, [media.url])

  if (media.status === 'empty') return null
  const showFallback = broken && legacyFallback && isDirectMediaUrl(legacyFallback) && legacyFallback !== media.url
  const url = showFallback ? legacyFallback : media.url
  if (media.status === 'unavailable' || media.status === 'loading' || !url || (broken && !showFallback)) {
    return (
      <span
        role="img"
        aria-label={media.status === 'loading' && !broken ? 'Loading file' : 'File unavailable'}
        className={cn(
          'inline-flex items-center justify-center bg-primary-50 text-center text-[11px] text-ink-400',
          className,
        )}
      >
        {media.status === 'loading' && !broken ? '' : 'File unavailable'}
      </span>
    )
  }
  return (
    <img
      {...rest}
      src={url}
      alt={alt}
      className={className}
      onError={(event) => {
        rest.onError?.(event)
        setBroken(true)
      }}
    />
  )
}

type MediaLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  href?: string | null
  legacyFallback?: string | null
  children: ReactNode
}

/** Link that opens a legacy URL or a signed URL, and stays quiet on 403/404. */
export function MediaLink({ href, legacyFallback, children, className, ...rest }: MediaLinkProps) {
  const media = useMediaUrl(href, legacyFallback)
  if (media.status === 'unavailable' || !media.url) {
    return <span className="text-xs text-ink-400">File unavailable</span>
  }
  if (media.status === 'loading') {
    return <span className="text-xs text-ink-400">Opening…</span>
  }
  return (
    <a {...rest} href={media.url} className={className}>
      {children}
    </a>
  )
}
