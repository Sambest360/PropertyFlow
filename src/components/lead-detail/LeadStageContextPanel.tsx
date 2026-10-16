import { Link } from 'react-router-dom'
import { ArrowRight, FileText, Link2 } from 'lucide-react'
import type { LeadStageContext } from '../../lib/leadContext'
import { Badge, Button, cn } from '../ui'
import { ICON_STROKE } from './types'

export function LeadStageContextPanel({
  context,
  onScheduleViewing,
  canScheduleViewing,
}: {
  context: LeadStageContext
  onScheduleViewing?: () => void
  canScheduleViewing?: boolean
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-primary-100 bg-white">
      <div className="border-l-4 border-primary bg-gradient-to-r from-primary-50/80 to-white px-5 py-4">
        <h3 className="font-display text-base font-semibold text-ink">{context.headline}</h3>
        {context.summary ? <p className="mt-1 text-sm text-ink-500">{context.summary}</p> : null}
      </div>

      {context.facts.length > 0 && (
        <dl className="grid gap-3 border-b border-primary-50 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
          {context.facts.map((fact) => (
            <div key={fact.label} className="min-w-0">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                {fact.label}
              </dt>
              <dd className="mt-0.5 truncate text-sm font-medium text-ink">{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="space-y-2 p-4 sm:p-5">
        {context.links.map((link) => (
          <Link
            key={link.id}
            to={link.href}
            className="group flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-primary-100 bg-primary-50/30 px-4 py-3 transition-colors duration-200 hover:border-primary-200 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-primary shadow-sm">
              <FileText className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-ink group-hover:text-primary">{link.title}</span>
                {link.meta ? <Badge tone="neutral">{link.meta}</Badge> : null}
              </span>
              <span className="mt-0.5 block text-sm text-ink-500">{link.description}</span>
            </span>
            <ArrowRight
              className={cn(
                'mt-2 h-4 w-4 shrink-0 text-ink-300 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary',
              )}
              strokeWidth={ICON_STROKE}
              aria-hidden
            />
          </Link>
        ))}

        {!context.links.length && context.emptyMessage ? (
          <div className="rounded-xl border border-dashed border-primary-200 bg-primary-50/40 px-4 py-5 text-center">
            <Link2 className="mx-auto h-5 w-5 text-primary" strokeWidth={ICON_STROKE} aria-hidden />
            <p className="mt-2 text-sm font-medium text-ink">{context.emptyMessage}</p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              {canScheduleViewing && onScheduleViewing ? (
                <Button
                  type="button"
                  className="min-h-11 gap-2"
                  onClick={onScheduleViewing}
                >
                  Schedule viewing
                  <ArrowRight className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                </Button>
              ) : null}
              {context.emptyAction ? (
                <Link
                  to={context.emptyAction.href}
                  className={cn(
                    'inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                    canScheduleViewing && onScheduleViewing
                      ? 'border border-primary-200 bg-white text-primary hover:bg-primary-50'
                      : 'bg-primary text-white hover:bg-primary-600',
                  )}
                >
                  {context.emptyAction.title}
                  <ArrowRight className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}
