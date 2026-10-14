import { Link } from 'react-router-dom'
import { cn } from '../ui'

export function BrandLogo({
  to = '/',
  size = 'md',
  tone = 'default',
  layout = 'inline',
  className,
}: {
  to?: string
  size?: 'sm' | 'md' | 'lg' | 'xs'
  /** default = dark ink; inverse = white; bridge = Pro white / perty ink over rail seam */
  tone?: 'default' | 'inverse' | 'bridge'
  /** stack = two-line lockup for narrow collapsed sidebar */
  layout?: 'inline' | 'stack'
  /** @deprecated wordmark is always shown */
  showWordmark?: boolean
  className?: string
}) {
  const sizes = {
    xs: 'text-[0.7rem] leading-none tracking-[-0.04em]',
    sm: 'text-[1.05rem] leading-none tracking-[-0.04em]',
    md: 'text-[1.35rem] leading-none tracking-[-0.045em]',
    lg: 'text-[1.75rem] leading-none tracking-[-0.05em]',
  }

  const propertyClass = tone === 'inverse' ? 'text-white' : 'text-ink'
  const flowClass =
    tone === 'inverse'
      ? 'text-white transition-opacity group-hover:opacity-90'
      : 'text-primary transition-colors group-hover:text-primary-600'

  if (layout === 'stack') {
    return (
      <Link
        to={to}
        aria-label="Letkaya"
        className={cn(
          'group inline-flex shrink-0 select-none flex-col items-center justify-center gap-0.5 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80',
          className,
        )}
      >
        <span className={cn('font-display font-semibold', sizes.xs, propertyClass)}>Property</span>
        <span className={cn('relative font-display font-semibold', sizes.xs, flowClass)}>
          Flow
          <span
            aria-hidden
            className="absolute -bottom-[0.18em] left-0 right-0 h-[0.12em] rounded-full bg-accent"
          />
        </span>
      </Link>
    )
  }

  return (
    <Link
      to={to}
      aria-label="Letkaya"
      className={cn('group inline-flex shrink-0 items-baseline gap-0 select-none', className)}
    >
      <span className={cn('font-display font-semibold', sizes[size])}>
        {tone === 'bridge' ? (
          <>
            <span className="text-white">Pro</span>
            <span className="text-ink">perty</span>
          </>
        ) : (
          <span className={propertyClass}>Property</span>
        )}
        <span className={cn('relative inline-block', flowClass)}>
          Flow
          <span
            aria-hidden
            className="absolute -bottom-[0.18em] left-0 right-0 h-[0.12em] rounded-full bg-accent"
          />
        </span>
      </span>
    </Link>
  )
}

/** Compact lockup for footers / dense UI */
export function BrandWordmark({ className }: { className?: string }) {
  return (
    <p className={cn('font-display text-lg font-semibold tracking-[-0.04em] text-ink', className)}>
      Property<span className="text-primary">Flow</span>
      <span className="ml-0.5 inline-block h-1.5 w-1.5 translate-y-[-0.15em] rounded-full bg-accent align-middle" />
    </p>
  )
}
