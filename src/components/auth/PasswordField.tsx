import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Input, cn } from '../ui'

const ICON_STROKE = 1.6

export function PasswordField({
  id,
  value,
  onChange,
  autoComplete,
  required,
  minLength,
  placeholder,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  autoComplete?: string
  required?: boolean
  minLength?: number
  placeholder?: string
}) {
  const [show, setShow] = useState(false)
  return (
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
  )
}
