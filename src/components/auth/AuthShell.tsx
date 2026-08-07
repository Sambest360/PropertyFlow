import { Link } from 'react-router-dom'
import { AlertCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { ActionButtonRow } from '../ActionButtonRow'
import { BackButton } from '../BackButton'
import { BrandLogo } from '../layout/BrandLogo'
import { Button, cn } from '../ui'

const ICON_STROKE = 1.6

const ASIDE_IMAGE =
  'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1400&q=80'

const WIDTH_CLASS = {
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
} as const

export function AuthShell({
  children,
  title,
  subtitle,
  crossLink,
  asideTitle,
  asideBody,
  asidePoints,
  bootstrapBanner,
  contentWidth = 'xl',
}: {
  children: ReactNode
  title: string
  subtitle: string
  crossLink: { to: string; label: string }
  asideTitle: string
  asideBody: string
  asidePoints: string[]
  bootstrapBanner?: ReactNode
  /** Form column max width — wider for multi-step register. */
  contentWidth?: keyof typeof WIDTH_CLASS
}) {
  return (
    <div className="relative flex min-h-screen flex-col bg-white text-ink lg:flex-row">
      {/* Atmosphere panel — desktop */}
      <aside className="relative hidden w-[40%] shrink-0 overflow-hidden bg-primary-800 lg:flex lg:flex-col lg:justify-between">
        <img
          src={ASIDE_IMAGE}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          aria-hidden
        />
        <div
          className="absolute inset-0 bg-gradient-to-br from-primary-900/92 via-primary-800/85 to-primary-600/75"
          aria-hidden
        />
        <div className="pointer-events-none absolute -left-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-20 -right-10 h-72 w-72 rounded-full bg-accent/25 blur-3xl" aria-hidden />

        <div className="relative z-10 px-10 pt-10">
          <BrandLogo to="/" size="lg" tone="inverse" />
        </div>

        <div className="relative z-10 flex flex-1 flex-col justify-end px-10 pb-14 pt-8">
          <p className="text-sm font-semibold uppercase tracking-wider text-white/70">PropertyFlow</p>
          <h2 className="mt-3 font-display text-3xl font-semibold leading-tight text-white xl:text-4xl">
            {asideTitle}
          </h2>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/85">{asideBody}</p>
          <ul className="mt-8 space-y-3">
            {asidePoints.map((point) => (
              <li key={point} className="flex items-start gap-3 text-sm text-white/90">
                <span
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                  aria-hidden
                />
                {point}
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {/* Form column */}
      <div className="relative flex min-h-screen flex-1 flex-col bg-surface-muted/60">
        <header className="flex items-center gap-3 px-4 py-4 sm:px-10 lg:px-12">
          <div className="lg:hidden">
            <BrandLogo to="/" size="sm" />
          </div>
          <ActionButtonRow className="ml-auto w-auto">
            <Link to={crossLink.to}>
              <Button variant="secondary" className="min-h-11 cursor-pointer">
                {crossLink.label}
              </Button>
            </Link>
            <BackButton to="/" label="Back to marketplace" shortLabel="Back" />
          </ActionButtonRow>
        </header>

        <main
          className={cn(
            'mx-auto flex w-full flex-1 flex-col justify-center px-4 pb-12 pt-2 sm:px-10 lg:px-12',
            WIDTH_CLASS[contentWidth],
          )}
        >
          <h1 className="font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            {title}
          </h1>
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink-500 sm:text-base">
            {subtitle}
          </p>
          {bootstrapBanner}
          <div className="mt-8">{children}</div>
        </main>
      </div>
    </div>
  )
}

export function AuthError({ message }: { message: string }) {
  if (!message) return null
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-2xl border border-accent-200 bg-accent-50 px-3 py-2.5 text-sm text-accent-800"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={ICON_STROKE} aria-hidden />
      <span>{message}</span>
    </div>
  )
}

export function AuthField({
  label,
  htmlFor,
  hint,
  children,
  className,
}: {
  label: string
  htmlFor: string
  hint?: string
  children: ReactNode
  className?: string
}) {
  return (
    <label htmlFor={htmlFor} className={cn('block text-sm font-medium text-ink', className)}>
      {label}
      <div className="mt-1.5">{children}</div>
      {hint ? <span className="mt-1 block text-xs text-ink-400">{hint}</span> : null}
    </label>
  )
}
