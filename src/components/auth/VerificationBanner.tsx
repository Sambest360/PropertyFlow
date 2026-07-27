import { ShieldAlert, ShieldCheck, ShieldX } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { AppUser } from '../../types/domain'
import { isVerificationPending } from '../../lib/verification'
import { cn } from '../ui'

const ICON_STROKE = 1.6

export function VerificationPendingBanner({ user }: { user: AppUser }) {
  const status = user.verification?.status
  if (user.role !== 'landlord' && user.role !== 'contractor') return null
  if (status === 'approved' || !status) return null

  if (status === 'rejected') {
    return (
      <div
        role="status"
        className="flex items-start gap-3 rounded-2xl border border-accent-200 bg-accent-50 px-4 py-3 text-sm text-accent-900"
      >
        <ShieldX className="mt-0.5 h-5 w-5 shrink-0" strokeWidth={ICON_STROKE} aria-hidden />
        <div>
          <p className="font-semibold">Verification rejected</p>
          <p className="mt-0.5 text-accent-800">
            {user.verification?.rejectNote ||
              'Your documents were not approved. Contact support or re-register with updated docs.'}
          </p>
        </div>
      </div>
    )
  }

  if (!isVerificationPending(user.verification, user.role)) return null

  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
    >
      <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" strokeWidth={ICON_STROKE} aria-hidden />
      <div>
        <p className="font-semibold">
          {user.role === 'landlord'
            ? 'Landlord verification pending'
            : 'Contractor verification pending'}
        </p>
        <p className="mt-0.5 text-amber-900/90">
          {user.role === 'landlord'
            ? 'You can draft properties, but they won’t appear on the marketplace until a Super Admin approves your documents.'
            : 'You can sign in, but you won’t receive assigned jobs until a Super Admin approves your documents.'}
        </p>
      </div>
    </div>
  )
}

export function VerificationStatusBadge({
  user,
  className,
}: {
  user: AppUser
  className?: string
}) {
  if (user.role !== 'landlord' && user.role !== 'contractor') return null
  const status = user.verification?.status
  if (!status || status === 'not_required') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800',
          className,
        )}
      >
        <ShieldCheck className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden />
        Verified
      </span>
    )
  }
  if (status === 'approved') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800',
          className,
        )}
      >
        <ShieldCheck className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden />
        Approved
      </span>
    )
  }
  if (status === 'rejected') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full bg-accent-50 px-2.5 py-0.5 text-xs font-semibold text-accent-800',
          className,
        )}
      >
        <ShieldX className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden />
        Rejected
      </span>
    )
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-900',
        className,
      )}
    >
      <ShieldAlert className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden />
      Pending review
    </span>
  )
}

export function AdminVerificationLink({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <Link
      to="/workspace/admin/users?status=pending_verification"
      className="inline-flex min-h-11 cursor-pointer items-center rounded-2xl border border-amber-200 bg-amber-50 px-3.5 text-sm font-semibold text-amber-950 transition-colors duration-200 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {count} pending verification{count === 1 ? '' : 's'}
    </Link>
  )
}
