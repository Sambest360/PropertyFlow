import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { ArrowRight, CalendarDays, ClipboardList, Home, X, Wrench } from 'lucide-react'
import { MediaImage } from '../media/MediaImage'
import { Badge, Button, cn, priorityTone, statusTone } from '../ui'
import { formatZAR } from '../../data/seed'
import type { Application, MaintenanceTicket, PropertyAsset, Viewing } from '../../types/domain'

type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand'

function asBadgeTone(tone: string): BadgeTone {
  if (tone === 'accent') return 'danger'
  if (
    tone === 'neutral' ||
    tone === 'success' ||
    tone === 'warning' ||
    tone === 'danger' ||
    tone === 'info' ||
    tone === 'brand'
  ) {
    return tone
  }
  return 'neutral'
}

export type PreviewTarget =
  | { kind: 'ticket'; ticket: MaintenanceTicket; property?: PropertyAsset }
  | { kind: 'viewing'; viewing: Viewing; property?: PropertyAsset }
  | { kind: 'application'; application: Application; property?: PropertyAsset }
  | { kind: 'property'; property: PropertyAsset }

function photoPlaceholders(property: PropertyAsset | undefined, count: number) {
  const imgs = property?.images ?? []
  if (imgs.length === 0) return []
  const n = Math.max(count, imgs.length)
  return Array.from({ length: Math.min(n, 8) }, (_, i) => imgs[i % imgs.length])
}

export function OpsPreviewModal({
  target,
  onClose,
}: {
  target: PreviewTarget | null
  onClose: () => void
}) {
  useEffect(() => {
    if (!target) return
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
  }, [target, onClose])

  if (!target) return null

  let eyebrow = ''
  let title = ''
  let detail = ''
  let badge = ''
  let badgeTone: BadgeTone = 'neutral'
  let metaRows: Array<{ label: string; value: string }> = []
  let photos: string[] = []
  let cta = { label: 'View more', to: '/workspace' }
  let Icon = Home

  if (target.kind === 'ticket') {
    const { ticket, property } = target
    Icon = Wrench
    eyebrow = 'Maintenance issue'
    title = ticket.title
    detail = ticket.description
    badge = ticket.priority
    badgeTone = asBadgeTone(priorityTone(ticket.priority))
    metaRows = [
      { label: 'Opened', value: ticket.openedAt },
      { label: 'Status', value: ticket.status },
      { label: 'Reported by', value: ticket.reportedBy },
      { label: 'Asset', value: ticket.assetLabel },
      { label: 'Cost', value: ticket.cost > 0 ? formatZAR(ticket.cost) : 'Not quoted' },
      { label: 'Property', value: property?.title ?? '—' },
    ]
    photos = photoPlaceholders(property, Math.max(ticket.photos, 3))
    cta = {
      label: 'Open in maintenance',
      to: `/workspace/operations/maintenance/${encodeURIComponent(ticket.id)}`,
    }
  } else if (target.kind === 'viewing') {
    const { viewing, property } = target
    Icon = CalendarDays
    eyebrow = 'Viewing'
    title = property?.title ?? 'Property viewing'
    detail = `With ${viewing.applicantName}`
    badge = viewing.status
    badgeTone = asBadgeTone(statusTone(viewing.status))
    metaRows = [
      { label: 'Date', value: viewing.date },
      { label: 'Time', value: viewing.time },
      { label: 'Applicant', value: viewing.applicantName },
      { label: 'Attendance', value: viewing.attendance },
      { label: 'Location', value: property ? `${property.suburb}, ${property.city}` : '—' },
    ]
    photos = photoPlaceholders(property, 4)
    cta = {
      label: 'Open viewings',
      to: viewing.propertyId
        ? `/workspace/sales/viewings/property/${encodeURIComponent(viewing.propertyId)}`
        : '/workspace/sales/viewings',
    }
  } else if (target.kind === 'application') {
    const { application, property } = target
    Icon = ClipboardList
    eyebrow = 'Application'
    title = application.applicantName
    detail = `${application.type} · ${property?.title ?? 'Property'}`
    badge = application.stage
    badgeTone = asBadgeTone(statusTone(application.stage))
    metaRows = [
      { label: 'Income', value: formatZAR(application.income) },
      { label: 'Employment', value: application.employment },
      { label: 'Updated', value: application.updatedAt.slice(0, 10) },
      { label: 'Docs', value: `${application.documents.filter((d) => d.status !== 'required').length} uploaded` },
    ]
    photos = photoPlaceholders(property, 4)
    cta = {
      label: 'Review application',
      to: `/workspace/sales/applications?application=${encodeURIComponent(application.id)}`,
    }
  } else {
    const { property } = target
    Icon = Home
    eyebrow = 'Property'
    title = property.title
    detail = property.address
    badge = property.status
    badgeTone = asBadgeTone(statusTone(property.status))
    metaRows = [
      { label: 'Type', value: property.type },
      { label: 'Beds / baths', value: `${property.beds} / ${property.baths}` },
      { label: 'Price', value: property.price != null ? formatZAR(property.price) : '—' },
      { label: 'Rent', value: property.rent != null ? formatZAR(property.rent) : '—' },
      { label: 'Location', value: `${property.suburb}, ${property.city}` },
    ]
    photos = property.images.length ? property.images : []
    cta = {
      label: 'Open property',
      to: `/workspace/properties/${property.id}`,
    }
  }

  // Top badge already shows stage/status — skip duplicate detail rows
  const detailRows = metaRows.filter((row) => {
    if (row.label !== 'Stage' && row.label !== 'Status') return true
    return row.value.trim().toLowerCase() !== badge.trim().toLowerCase()
  })

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ops-preview-title"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-pointer bg-ink/40 backdrop-blur-[2px] transition-opacity duration-200"
        aria-label="Close preview"
        onClick={onClose}
      />
      <div
        className={cn(
          'relative z-[1] flex max-h-[min(36rem,90vh)] w-full max-w-3xl flex-col overflow-hidden rounded-[1.35rem] border border-primary-100 bg-white shadow-xl shadow-ink/20',
          'sm:flex-row',
        )}
      >
        {/* Left: scrollable photos */}
        <div className="relative flex max-h-48 w-full shrink-0 flex-col bg-primary-50 sm:max-h-none sm:w-[42%]">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:thin]">
            {photos.length > 0 ? (
              <div className="flex flex-col gap-2 p-2 sm:gap-2.5 sm:p-3">
                {photos.map((src, i) => (
                  <MediaImage
                    key={`${src}-${i}`}
                    src={src}
                    alt=""
                    className="aspect-[4/3] w-full rounded-xl object-cover ring-1 ring-primary-100/80"
                  />
                ))}
              </div>
            ) : (
              <div className="flex h-full min-h-40 items-center justify-center p-6 text-sm text-ink-400">
                No photos
              </div>
            )}
          </div>
        </div>

        {/* Right: details + actions */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-3 border-b border-primary-100 px-5 py-4">
            <div className="min-w-0">
              <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-400">
                <Icon className="h-3.5 w-3.5 text-primary" strokeWidth={1.6} aria-hidden />
                {eyebrow}
              </p>
              <h2 id="ops-preview-title" className="mt-1 font-display text-xl font-semibold tracking-tight text-ink">
                {title}
              </h2>
              <p className="mt-1 text-sm text-ink-500">{detail}</p>
            </div>
            <div className="flex shrink-0 items-start gap-2">
              <Badge tone={badgeTone}>{badge}</Badge>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex min-h-9 min-w-9 cursor-pointer items-center justify-center rounded-xl text-ink-400 transition-colors duration-200 hover:bg-primary-50 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label="Close"
              >
                <X className="h-4 w-4" strokeWidth={1.6} />
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 [scrollbar-width:thin]">
            <dl className="space-y-2.5">
              {detailRows.map((row) => (
                <div
                  key={row.label}
                  className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-primary-50 pb-2.5 last:border-b-0 last:pb-0"
                >
                  <dt className="shrink-0 text-sm font-medium text-ink-400">{row.label}</dt>
                  <dd className="min-w-0 text-sm font-semibold tabular text-ink">{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-primary-100 px-5 py-4">
            <Link to={cta.to} onClick={onClose} className="inline-flex">
              <Button className="min-h-11 cursor-pointer gap-2 rounded-2xl">
                {cta.label}
                <ArrowRight className="h-4 w-4" strokeWidth={1.6} aria-hidden />
              </Button>
            </Link>
            {target.kind !== 'property' && target.property && (
              <Link
                to={`/workspace/properties/${target.property.id}`}
                onClick={onClose}
                className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-2xl border border-primary-100 px-4 text-sm font-semibold text-primary transition-colors duration-200 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                Property details
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
