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
        <li key={`${url.slice(0, 32)}-${i}`} className="overflow-hidden rounded-xl border border-primary-100">
          <a href={url} target="_blank" rel="noopener noreferrer" className="block aspect-[4/3]">
            <img src={url} alt={`Issue photo ${i + 1}`} className="h-full w-full object-cover" />
          </a>
        </li>
      ))}
    </ul>
  )
}
