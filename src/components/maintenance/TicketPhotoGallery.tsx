import { useMediaUrl } from '../media/MediaImage'
import { cn } from '../ui'

export function TicketPhotoGallery({
  urls,
  className,
}: {
  urls: string[]
  className?: string
}) {
  if (!urls.length) {
    return (
      <p className={cn('text-sm text-ink-400', className)}>No photos attached yet.</p>
    )
  }

  return (
    <ul className={cn('grid grid-cols-2 gap-2 sm:grid-cols-3', className)}>
      {urls.map((url, i) => (
        <li key={`${url.slice(0, 48)}-${i}`} className="overflow-hidden rounded-xl border border-primary-100">
          <TicketPhoto url={url} index={i} />
        </li>
      ))}
    </ul>
  )
}

function TicketPhoto({ url, index }: { url: string; index: number }) {
  const media = useMediaUrl(url)
  if (media.status === 'unavailable' || !media.url) {
    return (
      <span className="flex aspect-[4/3] items-center justify-center bg-primary-50 px-2 text-center text-[11px] text-ink-400">
        {media.status === 'loading' ? 'Loading…' : 'File unavailable'}
      </span>
    )
  }
  return (
    <a href={media.url} target="_blank" rel="noopener noreferrer" className="block aspect-[4/3]">
      <img src={media.url} alt={`Issue photo ${index + 1}`} className="h-full w-full object-cover" />
    </a>
  )
}
