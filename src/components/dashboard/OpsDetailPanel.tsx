import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Badge, Button, cn } from '../ui'
import { AvatarChip } from './AvatarStack'

export function OpsDetailPanel({
  eyebrow,
  title,
  subtitle,
  action,
  requestBy,
  status,
  statusTone,
  chips,
  children,
  className,
}: {
  eyebrow?: string
  title: string
  subtitle?: string
  action?: { label: string; to: string }
  requestBy?: string
  status?: string
  statusTone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand' | 'accent'
  chips?: ReactNode
  children?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'rounded-[1.25rem] border border-primary-100 bg-white p-5 shadow-[0_12px_32px_-24px_rgba(15,39,68,0.3)]',
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {eyebrow && (
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">{eyebrow}</p>
          )}
          <h2 className="mt-1 font-display text-xl font-semibold text-ink">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-ink-500">{subtitle}</p>}
        </div>
        {action && (
          <Link to={action.to}>
            <Button variant="secondary" size="sm" className="gap-1.5">
              {action.label} <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        )}
      </div>

      {(requestBy || status) && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {requestBy && (
            <div className="rounded-2xl bg-primary-50/70 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                Request by
              </p>
              <div className="mt-2 flex items-center gap-2">
                <AvatarChip name={requestBy} />
                <p className="text-sm font-medium text-ink">{requestBy}</p>
              </div>
            </div>
          )}
          {status && (
            <div className="rounded-2xl bg-primary-50/70 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Status</p>
              <div className="mt-2">
                <Badge tone={statusTone ?? 'neutral'}>{status}</Badge>
              </div>
            </div>
          )}
        </div>
      )}

      {chips && <div className="mt-4 flex flex-wrap gap-2">{chips}</div>}
      {children ? <div className="mt-auto pt-4">{children}</div> : null}
    </div>
  )
}
