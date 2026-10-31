/** Building blocks for the admin dashboard: panels, metrics, bar lists, trend charts, skeletons. */
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowDownRight, ArrowUpRight, ChevronRight } from 'lucide-react'
import { cn } from '../../ui'
import { Bone } from '../../loading/PageSkeleton'

export const fmtInt = (n: number) => new Intl.NumberFormat('en-ZA').format(n)
export const fmtZar = (n: number) =>
  new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(n)
/** R 1.2m / R 48k for tight spaces; exact value goes in the title attribute. */
export function fmtZarShort(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `R ${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}m`
  if (abs >= 10_000) return `R ${Math.round(n / 1000)}k`
  return fmtZar(n)
}

export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—'
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return '—'
  const s = Math.max(0, Math.round((now - t) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 30) return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** A titled surface. Calmer than Card: hairline border, no lift. */
export function Panel({
  title,
  meta,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: string
  meta?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={cn('min-w-0 rounded-2xl border border-primary-100 bg-white', className)}>
      {title ? (
        <header className="flex items-center justify-between gap-3 border-b border-primary-100/70 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 className="text-[13px] font-semibold text-ink">{title}</h2>
            {meta ? <p className="mt-0.5 truncate text-xs text-ink-400">{meta}</p> : null}
          </div>
          {action}
        </header>
      ) : null}
      <div className={cn('px-4 py-4 sm:px-5', bodyClassName)}>{children}</div>
    </section>
  )
}

/** One number with a label. `delta` is a signed change vs the previous period. */
export function Metric({
  label,
  value,
  sub,
  title,
  href,
  delta,
  tone,
}: {
  label: string
  value: string
  sub?: ReactNode
  title?: string
  href?: string
  delta?: { value: number; label: string } | null
  tone?: 'danger' | 'warning'
}) {
  const body = (
    <>
      <p className="text-xs text-ink-500">{label}</p>
      <p
        title={title}
        className={cn(
          'mt-1 text-[22px] font-semibold leading-none tracking-tight tabular-nums',
          tone === 'danger' ? 'text-accent-700' : tone === 'warning' ? 'text-amber-700' : 'text-ink',
        )}
      >
        {value}
      </p>
      <div className="mt-1.5 flex min-h-4 flex-wrap items-center gap-x-2 text-xs text-ink-400">
        {delta ? <Delta {...delta} /> : null}
        {sub}
      </div>
    </>
  )
  if (!href) return <div className="min-w-0">{body}</div>
  return (
    <Link to={href} className="-m-2 block min-w-0 rounded-lg p-2 transition-colors hover:bg-primary-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
      {body}
    </Link>
  )
}

export function Delta({ value, label }: { value: number; label: string }) {
  if (!Number.isFinite(value) || value === 0) return <span className="tabular-nums">No change {label}</span>
  const up = value > 0
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span className={cn('inline-flex items-center gap-0.5 tabular-nums', up ? 'text-emerald-700' : 'text-ink-500')}>
      <Icon className="h-3 w-3" aria-hidden />
      {up ? '+' : ''}
      {value}% <span className="text-ink-400">{label}</span>
    </span>
  )
}

/** % change, or null when there is nothing to compare against. */
export function pctChange(current: number, previous: number): number | null {
  if (!previous) return null
  return Math.round(((current - previous) / previous) * 100)
}

/** Horizontal bars for a short breakdown; one hue, labels and values in ink. */
export function BarList({
  rows,
  format = fmtInt,
  emptyText = 'Nothing recorded yet.',
}: {
  rows: Array<{ label: string; value: number; href?: string; tone?: 'danger' | 'warning' }>
  format?: (n: number) => string
  emptyText?: string
}) {
  const max = Math.max(0, ...rows.map((r) => r.value))
  if (!rows.length || max === 0) return <p className="py-2 text-sm text-ink-400">{emptyText}</p>
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,7.5rem)_1fr_auto] items-center gap-3 text-sm">
          <span className="truncate text-ink-600" title={r.label}>
            {r.label}
          </span>
          <span className="h-2 overflow-hidden rounded-full bg-primary-50" aria-hidden>
            <span
              className={cn(
                'block h-full rounded-full',
                r.tone === 'danger' ? 'bg-accent' : r.tone === 'warning' ? 'bg-amber-500' : 'bg-primary',
              )}
              style={{ width: `${r.value ? Math.max(3, (r.value / max) * 100) : 0}%` }}
            />
          </span>
          <span className="w-14 text-right font-medium tabular-nums text-ink">{format(r.value)}</span>
        </li>
      ))}
    </ul>
  )
}

export type SeriesPoint = { date: string; value: number }

const shortDate = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })

/**
 * One series over time: total for the range, change vs the range before (when
 * known), and an area chart with a date axis, value axis and hover tooltip.
 */
export function TrendCard({
  title,
  points,
  previousTotal,
  format = fmtInt,
  formatAxis,
  href,
  rangeLabel,
  bucket = 'day',
}: {
  title: string
  rangeLabel: string
  bucket?: 'day' | 'week'
  points: SeriesPoint[]
  previousTotal: number | null
  format?: (n: number) => string
  formatAxis?: (n: number) => string
  href?: string
}) {
  const total = points.reduce((a, p) => a + p.value, 0)
  const change = previousTotal == null ? null : pctChange(total, previousTotal)
  const gradientId = `trend-${title.replace(/\W+/g, '-').toLowerCase()}`
  return (
    <div className="min-w-0 rounded-2xl border border-primary-100 bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-ink-500">{title}</p>
          <p className="mt-1 text-xl font-semibold leading-none tracking-tight tabular-nums text-ink" title={format(total)}>
            {format(total)}
          </p>
          <div className="mt-1.5 min-h-4 text-xs text-ink-400">
            {change != null ? <Delta value={change} label="vs previous" /> : <span>{rangeLabel}</span>}
          </div>
        </div>
        {href ? (
          <Link to={href} aria-label={`Open ${title}`} className="rounded-md p-1 text-ink-400 hover:bg-primary-50 hover:text-primary">
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
        ) : null}
      </div>
      <div className="mt-3 h-28" role="img" aria-label={`${title}: ${format(total)}, ${rangeLabel.toLowerCase()}`}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.16} />
                <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--color-primary-100)" strokeDasharray="0" />
            <XAxis
              dataKey="date"
              tickFormatter={shortDate}
              tick={{ fontSize: 10, fill: 'var(--color-ink-400)' }}
              tickLine={false}
              axisLine={false}
              minTickGap={28}
              interval="preserveStartEnd"
            />
            <YAxis
              width={formatAxis ? 44 : 28}
              allowDecimals={false}
              tickFormatter={formatAxis ?? ((n: number) => fmtInt(n))}
              tick={{ fontSize: 10, fill: 'var(--color-ink-400)' }}
              tickLine={false}
              axisLine={false}
              tickCount={3}
            />
            <Tooltip
              cursor={{ stroke: 'var(--color-ink-300)', strokeWidth: 1 }}
              content={({ active, payload }) => {
                const p = active ? (payload?.[0]?.payload as SeriesPoint | undefined) : undefined
                if (!p) return null
                return (
                  <div className="rounded-lg border border-primary-100 bg-white px-2.5 py-1.5 text-xs shadow-sm">
                    <p className="text-ink-400">{bucket === 'week' ? `Week of ${shortDate(p.date)}` : shortDate(p.date)}</p>
                    <p className="font-semibold tabular-nums text-ink">{format(p.value)}</p>
                  </div>
                )
              }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="var(--color-primary)"
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/** Segmented control (two or three options). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-primary-100 bg-primary-50/50 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'min-h-8 rounded-md px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
            value === o.value ? 'bg-white text-ink shadow-sm' : 'text-ink-500 hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading dashboard">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="rounded-2xl border border-primary-100 bg-white p-4">
            <Bone className="h-3 w-20" />
            <Bone className="mt-3 h-6 w-16" />
            <Bone className="mt-2 h-3 w-24" />
          </div>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="rounded-2xl border border-primary-100 bg-white p-4">
            <Bone className="h-3 w-24" />
            <Bone className="mt-3 h-5 w-14" />
            <Bone className="mt-4 h-24 w-full" />
          </div>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Bone className="h-64 rounded-2xl lg:col-span-2" />
        <Bone className="h-64 rounded-2xl" />
      </div>
    </div>
  )
}
