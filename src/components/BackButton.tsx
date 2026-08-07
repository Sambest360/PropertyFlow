import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Button, cn } from './ui'

const ICON_STROKE = 1.6

export function BackButton({
  to,
  label,
  shortLabel,
  onClick,
  className,
}: {
  to?: string
  label: string
  shortLabel?: string
  onClick?: () => void
  className?: string
}) {
  const icon = <ArrowLeft className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
  const text = shortLabel ? (
    <>
      <span className="hidden sm:inline">{label}</span>
      <span className="sm:hidden">{shortLabel}</span>
    </>
  ) : (
    label
  )

  if (onClick) {
    return (
      <Button
        type="button"
        variant="secondary"
        className={cn('min-h-11 cursor-pointer', className)}
        onClick={onClick}
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
