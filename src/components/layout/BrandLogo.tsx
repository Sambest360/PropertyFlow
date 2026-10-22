import { Link } from 'react-router-dom'
import { cn } from '../ui'

const BRAND_ALT = 'Lekaya Rentals'

function logoSrc(tone: 'default' | 'inverse' | 'bridge', layout: 'inline' | 'stack'): string {
  if (layout === 'stack' || tone === 'bridge') return '/brand/lekaya-icon.svg'
  if (tone === 'inverse') return '/brand/lekaya-logo-mono-white.svg'
  return '/brand/lekaya-logo.svg'
}

const heightClass = {
  xs: 'h-7',
  sm: 'h-8',
  md: 'h-9',
  lg: 'h-11',
} as const

export function BrandLogo({
  to = '/',
  size = 'md',
  tone = 'default',
  layout = 'inline',
  className,
}: {
  to?: string
  size?: 'sm' | 'md' | 'lg' | 'xs'
  /** default = full logo; inverse = mono white; bridge = icon over rail seam */
  tone?: 'default' | 'inverse' | 'bridge'
  /** stack = icon mark for narrow collapsed sidebar */
  layout?: 'inline' | 'stack'
  /** @deprecated wordmark is always shown */
  showWordmark?: boolean
  className?: string
}) {
  const src = logoSrc(tone, layout)
  const h = layout === 'stack' ? heightClass.xs : heightClass[size]

  return (
    <Link
      to={to}
      aria-label={BRAND_ALT}
      className={cn(
        'group inline-flex shrink-0 select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
        layout === 'stack' && 'flex-col items-center justify-center py-1',
        tone === 'inverse' && 'focus-visible:ring-white/80',
        className,
      )}
    >
      <img
        src={src}
        alt={BRAND_ALT}
        className={cn('w-auto object-contain object-left', h)}
        decoding="async"
      />
    </Link>
  )
}

/** Compact lockup for footers / dense UI */
export function BrandWordmark({ className }: { className?: string }) {
  return (
    <img
      src="/brand/lekaya-logo.svg"
      alt={BRAND_ALT}
      className={cn('h-8 w-auto object-contain object-left', className)}
      decoding="async"
    />
  )
}
