import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Pencil } from 'lucide-react'
import { Badge, Button, cn } from '../ui'

export type AttentionHeroStat = { label: string; value: string }

export type AttentionHeroProps = {
  image?: string
  eyebrow: string
  title: string
  detail?: string
  badge?: string
  badgeTone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand' | 'accent'
  secondaryBadge?: string
  stats?: AttentionHeroStat[]
  cta?: { label: string; to: string; icon?: ReactNode }
  secondaryCta?: { label: string; to: string }
  propertyLink?: { label?: string; to: string }
  className?: string
}

export function AttentionHero({
  image,
  eyebrow,
  title,
  detail,
  badge,
  badgeTone = 'brand',
  secondaryBadge,
  stats = [],
  cta,
  secondaryCta,
  propertyLink,
  className,
}: AttentionHeroProps) {
  return (
    <section className={cn('relative overflow-hidden rounded-[1.5rem]', className)}>
      <div className="relative min-h-[14rem] sm:min-h-[17rem]">
        {image ? (
          <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-primary-100" />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-ink/55 via-ink/25 to-transparent" />

        <div className="relative flex h-full min-h-[14rem] flex-col justify-between gap-4 p-4 sm:min-h-[17rem] sm:p-6">
          <div className="flex justify-end">
            {propertyLink ? (
              <Link
                to={propertyLink.to}
                className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-white/40 bg-white/15 px-3 text-sm font-medium text-white backdrop-blur-sm transition-colors duration-200 hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <Pencil className="h-3.5 w-3.5" strokeWidth={1.6} aria-hidden />
                {propertyLink.label ?? 'Edit Profile'}
              </Link>
            ) : (
              <span className="min-h-10" aria-hidden />
            )}
          </div>

          <div className="max-w-xl rounded-[1.25rem] bg-white p-5 shadow-[0_20px_50px_-28px_rgba(15,39,68,0.55)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">{eyebrow}</p>
                <h1 className="mt-1 font-display text-xl font-semibold tracking-tight text-ink sm:text-2xl">
                  {title}
                </h1>
                {detail && <p className="mt-1 text-sm text-ink-500">{detail}</p>}
              </div>
              {(badge || secondaryBadge) && (
                <div className="flex flex-wrap gap-2">
                  {badge && <Badge tone={badgeTone}>{badge}</Badge>}
                  {secondaryBadge && <Badge tone="neutral">{secondaryBadge}</Badge>}
                </div>
              )}
            </div>

            {stats.length > 0 && (
              <div className="mt-4 grid grid-cols-3 gap-3 border-t border-primary-100 pt-4 text-sm">
                {stats.map((stat) => (
                  <div key={stat.label}>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                      {stat.label}
                    </p>
                    <p className="mt-0.5 truncate font-semibold tabular text-ink">{stat.value}</p>
                  </div>
                ))}
              </div>
            )}

            {(cta || secondaryCta) && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {cta && (
                  <Link to={cta.to} className="inline-flex">
                    <Button className="min-h-11 cursor-pointer gap-2 rounded-2xl">
                      {cta.icon}
                      {cta.label}
                      <ArrowRight className="h-4 w-4 opacity-80" strokeWidth={1.6} aria-hidden />
                    </Button>
                  </Link>
                )}
                {secondaryCta && (
                  <Link
                    to={secondaryCta.to}
                    className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-2xl px-3 text-sm font-semibold text-primary transition-colors duration-200 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    {secondaryCta.label}
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
