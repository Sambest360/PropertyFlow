import { Globe, Search } from 'lucide-react'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { cn } from '../ui'

const ICON_STROKE = 1.6

/** Pinned workspace-wide search — distinct from page-local filters */
export function SpotlightSearch({
  minimized = false,
  className,
}: {
  minimized?: boolean
  className?: string
}) {
  const [q, setQ] = useState('')
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const listId = useId()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && document.activeElement === inputRef.current) {
        inputRef.current?.blur()
        setQ('')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const onSearch = (e: FormEvent) => {
    e.preventDefault()
    const term = q.trim()
    if (!term) return
    navigate(`/workspace/properties?q=${encodeURIComponent(term)}`)
    inputRef.current?.blur()
  }

  const compact = minimized && !focused && q.length === 0

  return (
    <form
      role="search"
      aria-label="Global workspace search"
      onSubmit={onSearch}
      className={cn(
        'pointer-events-auto relative w-full transition-[max-width,transform] duration-200 ease-out',
        compact ? 'max-w-md scale-[0.96]' : 'max-w-2xl',
        className,
      )}
    >
      <div
        className={cn(
          'relative flex items-center transition-[box-shadow,background-color,min-height,border-radius] duration-200',
          compact
            ? 'min-h-10 rounded-[0.85rem] border border-primary-100/50 bg-white/70 shadow-lg shadow-ink/10 backdrop-blur-2xl'
            : 'min-h-12 rounded-full border border-primary-100 bg-white shadow-sm',
          focused && 'ring-2 ring-primary/25',
        )}
      >
        <Search
          className={cn(
            'pointer-events-none absolute text-ink-400 transition-all duration-200',
            compact ? 'left-3.5 h-3.5 w-3.5' : 'left-4 h-[1.05rem] w-[1.05rem]',
          )}
          strokeWidth={ICON_STROKE}
          aria-hidden
        />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={compact ? 'Global search…' : 'Search across workspace…'}
          aria-label="Global search"
          aria-autocomplete="list"
          aria-controls={listId}
          className={cn(
            'w-full cursor-text bg-transparent text-ink outline-none placeholder:text-ink-300',
            compact ? 'h-10 py-2 pl-10 pr-[5.5rem] text-sm' : 'h-12 py-2.5 pl-11 pr-[6.75rem] text-sm',
          )}
        />
        <span
          className={cn(
            'pointer-events-none absolute right-2 inline-flex items-center gap-1 rounded-full border border-primary-100 bg-primary-50 font-semibold text-primary',
            compact ? 'min-h-7 px-2 text-[10px]' : 'min-h-8 px-2.5 text-[11px]',
          )}
          aria-hidden
        >
          <Globe
            className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'}
            strokeWidth={ICON_STROKE}
          />
          Global
        </span>
      </div>
      <div id={listId} className="sr-only" aria-live="polite">
        {q
          ? `Press Enter to run a global search for ${q}`
          : 'Global search across the workspace, including properties'}
      </div>
    </form>
  )
}
