import { cn } from '../ui'
import { initials } from './formatShortDate'

export type AvatarPerson = {
  id: string
  name: string
}

export function AvatarStack({
  people,
  max = 3,
  emptyLabel = '—',
  className,
}: {
  people: AvatarPerson[]
  max?: number
  emptyLabel?: string
  className?: string
}) {
  const shown = people.slice(0, max)
  return (
    <div className={cn('flex -space-x-2', className)}>
      {shown.map((u) => (
        <span
          key={u.id}
          title={u.name}
          className="inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-primary-100 text-[10px] font-bold text-primary"
        >
          {initials(u.name)}
        </span>
      ))}
      {shown.length === 0 && (
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-surface-muted text-[10px] font-bold text-ink-400">
          {emptyLabel}
        </span>
      )}
    </div>
  )
}

export function AvatarChip({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded-full bg-white text-xs font-bold text-primary',
        className,
      )}
    >
      {initials(name)}
    </span>
  )
}
