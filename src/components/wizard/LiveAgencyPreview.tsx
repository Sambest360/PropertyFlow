import { Building2, Mail, MapPin, Phone } from 'lucide-react'
import { Badge, cn } from '../ui'

export function LiveAgencyPreview({
  name,
  slug,
  city,
  province,
  email,
  phone,
  moduleCount,
  className,
}: {
  name?: string
  slug?: string
  city?: string
  province?: string
  email?: string
  phone?: string
  moduleCount?: number
  className?: string
}) {
  return (
    <div className={cn('rounded-xl border border-primary-100 bg-white p-4 shadow-sm', className)}>
      <div className="flex items-start gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50 text-primary">
          <Building2 className="h-6 w-6" strokeWidth={1.6} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-lg font-semibold text-ink">{name?.trim() || 'Agency name'}</h3>
          <p className="text-sm text-ink-500">{slug ? `/${slug}` : 'agency-slug'}</p>
        </div>
        <Badge tone="neutral">New</Badge>
      </div>
      <ul className="mt-4 space-y-2 text-sm text-ink-600">
        {(city || province) && (
          <li className="flex items-center gap-2">
            <MapPin className="h-4 w-4 shrink-0 text-primary" strokeWidth={1.6} aria-hidden />
            {[city, province].filter(Boolean).join(', ') || 'Location'}
          </li>
        )}
        {email ? (
          <li className="flex items-center gap-2">
            <Mail className="h-4 w-4 shrink-0 text-primary" strokeWidth={1.6} aria-hidden />
            {email}
          </li>
        ) : null}
        {phone ? (
          <li className="flex items-center gap-2">
            <Phone className="h-4 w-4 shrink-0 text-primary" strokeWidth={1.6} aria-hidden />
            {phone}
          </li>
        ) : null}
      </ul>
      <p className="mt-4 rounded-lg border border-primary-100 bg-primary-50/50 px-3 py-2 text-xs text-ink-500">
        {moduleCount != null ? `${moduleCount} modules enabled` : 'Modules will appear here'}
      </p>
    </div>
  )
}
