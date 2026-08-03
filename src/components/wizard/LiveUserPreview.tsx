import { Mail, Phone, Shield, User } from 'lucide-react'
import { Badge, cn } from '../ui'
import { roleLabels } from '../../lib/permissions'
import type { Role } from '../../types/domain'

export function LiveUserPreview({
  name,
  email,
  phone,
  role,
  agencyName,
  permissionCount,
  addressLine,
  city,
  className,
}: {
  name?: string
  email?: string
  phone?: string
  role?: Role
  agencyName?: string | null
  permissionCount?: number
  addressLine?: string
  city?: string
  className?: string
}) {
  return (
    <div className={cn('rounded-xl border border-primary-100 bg-white p-4 shadow-sm', className)}>
      <div className="flex items-start gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-50 text-primary">
          <User className="h-6 w-6" strokeWidth={1.6} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-lg font-semibold text-ink">{name?.trim() || 'Full name'}</h3>
          {role ? <Badge className="mt-1">{roleLabels[role]}</Badge> : null}
        </div>
      </div>
      <ul className="mt-4 space-y-2 text-sm text-ink-600">
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
        {agencyName ? (
          <li className="flex items-center gap-2">
            <Shield className="h-4 w-4 shrink-0 text-primary" strokeWidth={1.6} aria-hidden />
            {agencyName}
          </li>
        ) : null}
        {(addressLine || city) && (
          <li className="text-ink-500">
            {[addressLine, city].filter(Boolean).join(', ')}
          </li>
        )}
      </ul>
      {permissionCount != null ? (
        <p className="mt-4 rounded-lg border border-primary-100 bg-primary-50/50 px-3 py-2 text-xs text-ink-500">
          {permissionCount} permissions enabled
        </p>
      ) : null}
    </div>
  )
}
