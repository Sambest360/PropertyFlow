import type { LucideIcon } from 'lucide-react'
import { cn } from '../ui'

export type TypeCardOption = {
  value: string
  label: string
  blurb?: string
  icon: LucideIcon
}

export function TypeCardGrid({
  options,
  value,
  onChange,
  columns = 3,
}: {
  options: TypeCardOption[]
  value: string
  onChange: (value: string) => void
  columns?: 2 | 3 | 4
}) {
  const gridClass =
    columns === 2 ? 'sm:grid-cols-2' : columns === 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-3'

  return (
    <div className={cn('grid gap-2', gridClass)} role="radiogroup">
      {options.map((opt) => {
        const selected = value === opt.value
        const Icon = opt.icon
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(opt.value)}
            className={cn(
              'flex min-h-11 cursor-pointer flex-col items-start gap-2 rounded-2xl border px-4 py-3.5 text-left transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              selected
                ? 'border-primary bg-primary-50 ring-1 ring-primary/20'
                : 'border-primary-100 bg-white hover:bg-primary-50/60',
            )}
          >
            <span
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-xl',
                selected ? 'bg-primary text-white' : 'bg-primary-50 text-primary',
              )}
            >
              <Icon className="h-5 w-5" strokeWidth={1.6} aria-hidden />
            </span>
            <span className="block text-sm font-semibold text-ink">{opt.label}</span>
            {opt.blurb ? <span className="block text-xs text-ink-500">{opt.blurb}</span> : null}
          </button>
        )
      })}
    </div>
  )
}
