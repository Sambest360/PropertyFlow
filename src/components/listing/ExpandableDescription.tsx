import { useMemo, useState } from 'react'
import { cn } from '../ui'

const DEFAULT_COLLAPSED_MAX_CHARS = 320

export function ExpandableDescription({
  text,
  collapsedMaxChars = DEFAULT_COLLAPSED_MAX_CHARS,
  className,
  fadeFromClassName = 'from-white',
}: {
  text: string
  collapsedMaxChars?: number
  className?: string
  /** Tailwind gradient origin colour — match parent background */
  fadeFromClassName?: string
}) {
  const [expanded, setExpanded] = useState(false)
  const trimmed = text.trim()

  const needsExpand = useMemo(() => {
    if (!trimmed) return false
    if (trimmed.length > collapsedMaxChars) return true
    return trimmed.split(/\n\s*\n/).length > 2
  }, [trimmed, collapsedMaxChars])

  if (!trimmed) {
    return <p className={cn('text-sm text-ink-500', className)}>No description provided.</p>
  }

  return (
    <div className={className}>
      <div
        className={cn(
          'relative overflow-hidden',
          !expanded && needsExpand && 'max-h-[9.75rem]',
        )}
      >
        <div className="whitespace-pre-wrap text-sm leading-relaxed text-ink-600">{trimmed}</div>
        {!expanded && needsExpand ? (
          <div
            className={cn(
              'pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t to-transparent',
              fadeFromClassName,
            )}
            aria-hidden
          />
        ) : null}
      </div>
      {needsExpand ? (
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          className="mt-2 cursor-pointer text-sm font-semibold text-primary transition-colors hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {expanded ? 'Show less' : 'Read full description +'}
        </button>
      ) : null}
    </div>
  )
}
