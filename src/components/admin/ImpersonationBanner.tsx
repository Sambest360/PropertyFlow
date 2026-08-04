import { UserRoundSearch, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Button } from '../ui'

const ICON_STROKE = 1.6

export function ImpersonationBanner() {
  const navigate = useNavigate()
  const { isImpersonating, user, realUser, stopImpersonation } = useAuth()
  if (!isImpersonating) return null

  const exit = () => {
    stopImpersonation()
    navigate('/workspace', { replace: true })
  }

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 border-b border-accent-100 bg-accent-50 px-4 py-2.5 text-sm text-ink lg:px-8"
    >
      <p className="inline-flex items-center gap-2 font-medium">
        <UserRoundSearch className="h-4 w-4 shrink-0 text-accent" strokeWidth={ICON_STROKE} aria-hidden />
        Viewing as <strong>{user.name}</strong>
        <span className="text-ink-500">({realUser.name})</span>
      </p>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="min-h-11 cursor-pointer"
        onClick={exit}
      >
        <X className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
        Exit impersonation
      </Button>
    </div>
  )
}
