import { cn } from '../ui'

export function CounterPillRow({
  label,
  value,
  onChange,
  min = 0,
  max = 5,
  extraLabel = '5+',
}: {
  label: string
  value: number
  onChange: (n: number) => void
  min?: number
  max?: number
  extraLabel?: string
}) {
  const pills = Array.from({ length: max - min + 1 }, (_, i) => min + i)

  return (
    <fieldset>
      <legend className="text-sm font-medium text-ink">{label}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {pills.map((n) => {
          const selected = value === n
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              aria-pressed={selected}
              className={cn(
                'flex h-11 min-w-11 cursor-pointer items-center justify-center rounded-full px-4 text-sm font-semibold tabular-nums transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                selected
                  ? 'bg-primary text-white'
                  : 'bg-white text-ink-600 ring-1 ring-primary-100 hover:bg-primary-50',
              )}
            >
              {n === max && extraLabel ? extraLabel : n}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}
