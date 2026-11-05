import { cn } from '../ui'
import { initials } from './formatShortDate'
import { useStore } from '../../context/AppStore'

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
  const { state } = useStore()
  const shown = people.slice(0, max)
  const photo = (id: string) => state.users.find((x) => x.id === id)?.avatar
  return (
    <div className={cn('flex -space-x-2', className)}>
      {shown.map((u) => (
        <span
          key={u.id}
          title={u.name}
          className="inline-flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-primary-100 text-[10px] font-bold text-primary"
        >
          {photo(u.id) ? <img src={photo(u.id)} alt="" className="h-full w-full object-cover" /> : initials(u.name)}
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

export function AvatarChip({ name, avatar, className }: { name: string; avatar?: string | null; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-white text-xs font-bold text-primary',
        className,
      )}
    >
      {avatar ? <img src={avatar} alt="" className="h-full w-full object-cover" /> : initials(name)}
    </span>
  )
}
