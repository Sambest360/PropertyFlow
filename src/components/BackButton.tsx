import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Button, cn } from './ui'

const ICON_STROKE = 1.6

export function BackButton({
  to,
  label,
  shortLabel,
  onClick,
  className,
  preferHistory,
}: {
  to?: string
  label: string
  shortLabel?: string
  onClick?: () => void
  className?: string
  /** Go back to the page the visitor came from (keeps their filters, e.g. To rent); `to` is used only when they arrived directly. */
  preferHistory?: boolean
}) {
  const location = useLocation()
  const navigate = useNavigate()
  const icon = <ArrowLeft className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
  const text = shortLabel ? (
    <>
      <span className="hidden sm:inline">{label}</span>
      <span className="sm:hidden">{shortLabel}</span>
    </>
  ) : (
    label
  )

  const cameFromApp = location.key !== 'default'
  const handleClick = onClick ?? (preferHistory && cameFromApp ? () => navigate(-1) : undefined)

  if (handleClick) {
    return (
      <Button
        type="button"
        variant="secondary"
        className={cn('min-h-11 cursor-pointer', className)}
        onClick={handleClick}
      >
        {icon}
        {text}
      </Button>
    )
  }

  return (
    <Link to={to ?? '/'} className={className}>
      <Button variant="secondary" className="min-h-11 cursor-pointer">
        {icon}
        {text}
      </Button>
    </Link>
  )
}
