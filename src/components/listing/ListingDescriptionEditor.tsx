import { useEffect, useRef } from 'react'
import { cn } from '../ui'

export function ListingDescriptionEditor({
  value,
  onChange,
  label = 'Description',
  className,
  id,
}: {
  value: string
  onChange: (next: string) => void
  label?: string
  className?: string
  id?: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(el.scrollHeight, 160)}px`
  }, [value])

  const paragraphs = value.trim() ? value.trim().split(/\n\s*\n/).filter(Boolean).length : 0

  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      <textarea
        ref={ref}
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={6}
        placeholder="Describe the property, location, and ideal tenant or buyer. Leave a blank line between paragraphs — they display separately on the listing."
        className="min-h-40 w-full resize-y rounded-xl border border-primary-100 bg-white px-3 py-2 text-base leading-relaxed text-ink placeholder:text-ink-400 focus:border-primary focus:bg-primary-50 focus:outline-none sm:text-sm"
      />
      <p className="text-xs text-ink-400">
        {value.length.toLocaleString()} characters
        {paragraphs > 0 ? ` · ${paragraphs} paragraph${paragraphs === 1 ? '' : 's'}` : ''}
      </p>
    </div>
  )
}
