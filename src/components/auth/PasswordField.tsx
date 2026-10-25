import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Input, cn } from '../ui'
import { passwordStrength } from '../../lib/auth/passwordStrength'

const ICON_STROKE = 1.6

const STRENGTH_COLORS = [
  '',
  'bg-red-400',
  'bg-amber-400',
  'bg-primary-300',
  'bg-emerald-500',
] as const

export function PasswordField({
  id,
  value,
  onChange,
  autoComplete,
  required,
  minLength,
  placeholder,
  showStrength = false,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  autoComplete?: string
  required?: boolean
  minLength?: number
  placeholder?: string
  /** Renders the live strength meter under the input (register wizard). */
  showStrength?: boolean
}) {
  const [show, setShow] = useState(false)
  const strength = showStrength ? passwordStrength(value) : null
  return (
    <div>
      {/* The eye button is positioned against this wrapper, not the page. */}
      <div className="relative">
        <Input
          id={id}
          type={show ? 'text' : 'password'}
          className="min-h-11 pr-12"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          required={required}
          minLength={minLength}
          placeholder={placeholder}
        />
        <button
          type="button"
          className={cn(
            'absolute right-1.5 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-xl text-ink-400 transition-colors duration-200 hover:bg-primary-50 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          )}
          onClick={() => setShow((s) => !s)}
          aria-label={show ? 'Hide password' : 'Show password'}
        >
          {show ? (
            <EyeOff className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
          ) : (
            <Eye className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
          )}
        </button>
      </div>
      {strength && value.length > 0 && (
        <div className="mt-1.5 flex items-center gap-2" aria-live="polite">
          <div className="flex flex-1 gap-1" aria-hidden>
            {[1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className={cn(
                  'h-1 flex-1 rounded-full transition-colors duration-200',
                  i <= strength.score ? STRENGTH_COLORS[strength.score] : 'bg-ink-100',
                )}
              />
            ))}
          </div>
          <span className="text-xs text-ink-400 whitespace-nowrap">
            {strength.label}
            {strength.hint ? ` — ${strength.hint}` : ''}
          </span>
        </div>
      )}
    </div>
  )
}
