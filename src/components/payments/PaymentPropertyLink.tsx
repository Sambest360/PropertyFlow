import { Link } from 'react-router-dom'
import { ArrowUpRight, MapPin } from 'lucide-react'

const ICON_STROKE = 1.6

export function PaymentPropertyLink({
  propertyId,
  title,
}: {
  propertyId: string
  title: string
}) {
  return (
    <Link
      to={`/workspace/properties/${propertyId}?tab=payments`}
      className="inline-flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-xl border border-primary-100 bg-primary-50/50 px-3 text-sm font-semibold text-primary transition-colors duration-200 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <MapPin className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
      <span className="min-w-0 flex-1 truncate text-left">{title}</span>
      <ArrowUpRight className="h-4 w-4 shrink-0" strokeWidth={ICON_STROKE} aria-hidden />
    </Link>
  )
}
