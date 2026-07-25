import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { Plus, UserPlus, X } from 'lucide-react'
import { Button, Input, cn } from '../ui'

const ICON_STROKE = 1.6

export type ViewingGuest = {
  name: string
  email?: string
}

export function GuestListEditor({
  guests,
  onChange,
  label = 'People invited',
  hint = 'Add one person, or several for a group viewing.',
  disabled,
}: {
  guests: ViewingGuest[]
  onChange: (next: ViewingGuest[]) => void
  label?: string
  hint?: string
  disabled?: boolean
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)

  const addGuest = (e?: FormEvent) => {
    e?.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Enter a name.')
      return
    }
    if (guests.some((g) => g.name.toLowerCase() === trimmed.toLowerCase())) {
      setError('That person is already on the list.')
      return
    }
    onChange([...guests, { name: trimmed, email: email.trim() || undefined }])
    setName('')
    setEmail('')
    setError(null)
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addGuest()
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-medium text-ink-500">{label}</p>
        <p className="mt-0.5 text-xs text-ink-400">{hint}</p>
      </div>

      {guests.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {guests.map((g) => (
            <li
              key={`${g.name}-${g.email ?? ''}`}
              className="inline-flex min-h-10 max-w-full items-center gap-2 rounded-full border border-primary-100 bg-primary-50/70 pl-3 pr-1.5 text-sm"
            >
              <span className="min-w-0 truncate font-medium text-ink">{g.name}</span>
              {g.email && <span className="hidden truncate text-xs text-ink-400 sm:inline">{g.email}</span>}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => onChange(guests.filter((x) => x !== g))}
                  className="inline-flex min-h-8 min-w-8 cursor-pointer items-center justify-center rounded-full text-ink-400 transition-colors duration-150 hover:bg-white hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  aria-label={`Remove ${g.name}`}
                >
                  <X className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!disabled && (
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <Input
            className="min-h-11"
            placeholder="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={onKeyDown}
            aria-label="Guest name"
          />
          <Input
            className="min-h-11"
            type="email"
            placeholder="Email (optional)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={onKeyDown}
            aria-label="Guest email"
          />
          <Button
            type="button"
            variant="secondary"
            className={cn('min-h-11 gap-1.5 rounded-2xl')}
            onClick={() => addGuest()}
          >
            <UserPlus className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
            Add
          </Button>
        </div>
      )}

      {guests.length === 0 && !disabled && (
        <p className="inline-flex items-center gap-1.5 text-xs text-ink-400">
          <Plus className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden />
          Empty list — add individuals or build a group before saving.
        </p>
      )}

      {error && (
        <p role="alert" className="text-xs font-medium text-accent">
          {error}
        </p>
      )}

      {guests.length > 0 && (
        <p className="tabular text-xs font-medium text-ink-500">
          {guests.length} {guests.length === 1 ? 'person' : 'people'} on this viewing
        </p>
      )}
    </div>
  )
}
