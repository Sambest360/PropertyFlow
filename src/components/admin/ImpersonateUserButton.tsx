import { UserRoundSearch } from 'lucide-react'
import type { AppUser } from '../../types/domain'
import { useImpersonateUser } from '../../hooks/useImpersonateUser'
import { Button, cn } from '../ui'

const ICON_STROKE = 1.6

type ImpersonateUserButtonProps = {
  target: AppUser
  variant?: 'button' | 'compact'
  className?: string
}

export function ImpersonateUserButton({
  target,
  variant = 'button',
  className,
}: ImpersonateUserButtonProps) {
  const { canImpersonate, impersonateUser } = useImpersonateUser()
  if (!canImpersonate(target)) return null

  if (variant === 'compact') {
    return (
      <button
        type="button"
        title={`Impersonate ${target.name}`}
        aria-label={`Impersonate ${target.name}`}
        className={cn(
          'inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-xl border border-primary-100 px-3 text-xs font-semibold text-ink-600 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          className,
        )}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          impersonateUser(target)
        }}
      >
        <UserRoundSearch className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
      </button>
    )
  }

  return (
    <Button
      type="button"
      variant="secondary"
      className={cn('min-h-11 cursor-pointer', className)}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        impersonateUser(target)
      }}
    >
      <UserRoundSearch className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
      Impersonate
    </Button>
  )
}
