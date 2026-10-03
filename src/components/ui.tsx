import clsx from 'clsx'
import { forwardRef, isValidElement, useEffect, useState, Children, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { MoreHorizontal, X } from 'lucide-react'
import { ActionButtonRow } from './ActionButtonRow'

export function cn(...inputs: (string | false | null | undefined)[]) {
  return clsx(inputs)
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const raw = actions ? Children.toArray(actions) : []
  // Callers may pass a pre-wrapped <ActionButtonRow>; unwrap it so action
  // counting (and the mobile overflow menu) sees the real buttons.
  const first = raw[0]
  const actionItems =
    raw.length === 1 && isValidElement(first) && first.type === ActionButtonRow
      ? Children.toArray((first.props as { children?: ReactNode }).children)
      : raw
  const collapseMobile = actionItems.length > 1

  return (
    <div
      className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between animate-slide-up"
      data-tip-target="page-header"
    >
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-[1.75rem]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-400">{subtitle}</p>}
      </div>
      {actions ? (
        <>
          <ActionButtonRow className={cn(collapseMobile && 'hidden sm:flex', 'sm:w-auto')}>
            {actionItems}
          </ActionButtonRow>
          {collapseMobile ? (
            <div className="relative sm:hidden">
              <ActionButtonRow>
                {actionItems[actionItems.length - 1]}
                <button
                  type="button"
                  aria-expanded={menuOpen}
                  aria-label="More actions"
                  onClick={() => setMenuOpen((o) => !o)}
                  className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-full border border-primary-100 text-ink-500 transition-colors duration-200 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <MoreHorizontal className="h-5 w-5" strokeWidth={1.6} />
                </button>
                {menuOpen ? (
                  <div className="absolute right-0 top-full z-20 mt-2 flex min-w-[12rem] flex-col gap-2 rounded-2xl border border-primary-100 bg-white p-2 shadow-lg shadow-ink/10">
                    {actionItems.slice(0, -1).map((item, i) => (
                      <div key={i} onClick={() => setMenuOpen(false)}>
                        {item}
                      </div>
                    ))}
                  </div>
                ) : null}
              </ActionButtonRow>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}

export function Card({
  children,
  className,
  hover,
  onClick,
}: {
  children: ReactNode
  className?: string
  hover?: boolean
  onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded-[1.25rem] border border-primary-100/80 bg-white shadow-[0_8px_24px_-16px_rgba(15,39,68,0.18)]',
        hover && 'transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_28px_-16px_rgba(15,39,68,0.22)] hover:border-primary-200',
        onClick && 'cursor-pointer',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function StatCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string
  value: string | number
  hint?: string
  icon: ReactNode
  accent?: string
}) {
  return (
    <Card className="p-5 animate-slide-up" hover>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-ink-500">{label}</p>
          <p className="mt-1.5 tabular text-2xl font-semibold tracking-tight text-ink">{value}</p>
          {hint && <p className="mt-1 text-xs text-ink-400">{hint}</p>}
        </div>
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary">
          {icon}
        </div>
      </div>
    </Card>
  )
}

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand' | 'accent'
  className?: string
}) {
  const tones = {
    neutral: 'bg-primary-50 text-ink-600',
    success: 'bg-emerald-50 text-emerald-700',
    warning: 'bg-amber-50 text-amber-700',
    danger: 'bg-accent-50 text-accent-700',
    info: 'bg-primary-50 text-primary-700',
    brand: 'bg-primary text-white',
    accent: 'bg-accent text-white',
  }
  return (
    <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium', tones[tone], className)}>
      {children}
    </span>
  )
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
}) {
  const variants = {
    primary: 'bg-primary text-white hover:bg-primary-600 shadow-sm shadow-primary/20',
    secondary: 'bg-white text-primary border border-primary/30 hover:bg-primary-50',
    ghost: 'bg-transparent text-ink-600 hover:bg-primary-50',
    danger: 'bg-accent text-white hover:bg-accent-600',
  }
  const sizes = {
    sm: 'min-h-11 px-3.5 text-xs',
    md: 'min-h-11 px-5 text-sm',
    lg: 'min-h-12 px-6 text-sm',
  }
  return (
    <button
      className={cn(
        'inline-flex cursor-pointer items-center justify-center gap-2 rounded-full font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          'h-10 w-full rounded-xl border border-primary-100 bg-white px-3 text-base text-ink placeholder:text-ink-400 focus:border-primary focus:bg-primary-50 sm:text-sm',
          className,
        )}
        {...props}
      />
    )
  },
)

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'w-full rounded-xl border border-primary-100 bg-white px-3 py-2 text-base text-ink placeholder:text-ink-400 focus:border-primary focus:bg-primary-50 sm:text-sm',
        className,
      )}
      {...props}
    />
  )
}

export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'h-10 rounded-xl border border-primary-100 bg-white px-3 text-base text-ink sm:text-sm',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  )
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-primary-200 p-10 text-center">
      <p className="font-medium text-ink">{title}</p>
      <p className="mt-1 text-sm text-ink-500">{description}</p>
    </div>
  )
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  const widths = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
  }

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center p-3 sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 cursor-pointer bg-ink/40 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={cn(
          'relative z-10 flex max-h-[90vh] w-full flex-col overflow-hidden rounded-[1.25rem] border border-primary-100 bg-white shadow-[0_24px_48px_-20px_rgba(15,39,68,0.35)]',
          widths[size],
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-primary-50 px-5 py-4">
          <div className="min-w-0">
            <h2 id="modal-title" className="font-display text-lg font-semibold tracking-tight text-ink">
              {title}
            </h2>
            {description && <p className="mt-0.5 text-sm text-ink-500">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-xl text-ink-400 transition-colors duration-200 hover:bg-primary-50 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label="Close"
          >
            <X className="h-5 w-5" strokeWidth={1.6} aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <ActionButtonRow className="border-t border-primary-50 px-5 py-4">
            {footer}
          </ActionButtonRow>
        )}
      </div>
    </div>,
    document.body,
  )
}

export function statusTone(status: string): 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand' | 'accent' {
  const s = status.toLowerCase()
  // Standardized property portfolio statuses
  if (s === 'available' || s === 'published') return 'success'
  if (s === 'featured') return 'brand'
  if (s === 'quiet') return 'neutral'
  if (s === 'occupied' || s === 'rented') return 'info'
  if (s === 'maintenance') return 'danger'
  if (s === 'under offer') return 'warning'

  if (['published', 'featured', 'paid', 'settled', 'completed', 'approved', 'signed', 'verified', 'passed', 'active', 'attended'].some((x) => s.includes(x)))
    return 'success'
  if (['pending', 'progress', 'scheduled', 'processing', 'draft', 'awaiting', 'requested', 'offer'].some((x) => s.includes(x)))
    return 'warning'
  if (['overdue', 'cancelled', 'no-show', 'urgent', 'high', 'failed', 'maintenance', 'blocked', 'rejected'].some((x) => s.includes(x)))
    return 'danger'
  if (['sold', 'rented', 'archived', 'occupied'].some((x) => s.includes(x))) return 'info'
  if (['new', 'contacted'].some((x) => s.includes(x))) return 'brand'
  return 'neutral'
}

export function priorityTone(p: string) {
  if (p === 'Urgent' || p === 'High' || p === 'Emergency') return 'danger' as const
  if (p === 'Medium') return 'warning' as const
  return 'neutral' as const
}
