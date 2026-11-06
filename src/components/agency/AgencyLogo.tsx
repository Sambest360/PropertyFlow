/**
 * An agency's logo where one is saved (Agency profile), otherwise its
 * initials. Reads the logo from the store so a new logo shows everywhere.
 */
import { useOptionalStore } from '../../context/AppStore'
import { initials } from '../../lib/contactLinks'
import { cn } from '../ui'

export function AgencyLogo({
  agencyId,
  name,
  logoUrl,
  className,
}: {
  agencyId?: string | null
  name: string
  logoUrl?: string | null
  /** Size classes (default h-10 w-10). */
  className?: string
}) {
  const store = useOptionalStore()
  const logo = logoUrl || (agencyId ? store?.state.agencies.find((a) => a.id === agencyId)?.logoUrl : undefined)
  const size = className && /(^|\s)h-/.test(className) ? className : cn('h-10 w-10', className)
  return logo ? (
    <img src={logo} alt={`${name} logo`} className={cn('shrink-0 rounded-xl border border-primary-100 bg-white object-contain p-0.5', size)} />
  ) : (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center rounded-xl bg-primary-50 text-xs font-semibold text-primary', size)}
      aria-hidden
    >
      {initials(name) || '?'}
    </span>
  )
}
