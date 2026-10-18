import { Mail, Phone } from 'lucide-react'
import type { AppUser } from '../../types/domain'
import { ActionButtonRow } from '../ActionButtonRow'
import { BackButton } from '../BackButton'
import { Button } from '../ui'
import { ImpersonateUserButton } from '../admin/ImpersonateUserButton'
import { ResetPasswordButton } from '../admin/ResetPasswordButton'
import { useAuth } from '../../context/AuthContext'
import { isApiEnabled } from '../../lib/api/config'
import { showPasswordResetEntry } from '../../lib/auth/passwordResetUi'
import { ICON_STROKE } from './types'

type TeamDetailHeaderProps = {
  user: AppUser
  /** When true, agency/platform admins may enable or disable this account. */
  mutable?: boolean
  onToggleActive?: () => void
}

export function TeamDetailHeader({ user, mutable, onToggleActive }: TeamDetailHeaderProps) {
  const { has, realUser } = useAuth()
  const canReset = showPasswordResetEntry({
    hasUsersManage: has('users.manage'),
    apiMode: isApiEnabled,
    viewerId: realUser.id,
    target: user,
  })
  return (
    <div className="mb-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-[1.75rem]">
            {user.name}
          </h1>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-600">
            <span className="inline-flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5 text-ink-400" strokeWidth={ICON_STROKE} aria-hidden />
              {user.email}
            </span>
            {user.phone ? (
              <span className="inline-flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5 text-ink-400" strokeWidth={ICON_STROKE} aria-hidden />
                {user.phone}
              </span>
            ) : null}
          </div>
        </div>

        <ActionButtonRow className="sm:w-auto">
          {mutable && onToggleActive ? (
            <Button
              type="button"
              variant={user.active ? 'secondary' : 'primary'}
              className="min-h-11 cursor-pointer"
              onClick={onToggleActive}
            >
              {user.active ? 'Disable account' : 'Enable account'}
            </Button>
          ) : null}
          <ImpersonateUserButton target={user} />
          {canReset ? <ResetPasswordButton userId={user.id} userName={user.name} /> : null}
          <Button
            variant="secondary"
            className="min-h-11"
            onClick={() => window.open(`mailto:${user.email}`, '_self')}
          >
            <Mail className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
            Email
          </Button>
          {user.phone ? (
            <Button
              variant="secondary"
              className="min-h-11"
              onClick={() => window.open(`tel:${user.phone}`, '_self')}
            >
              <Phone className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
              Call
            </Button>
          ) : null}
          <BackButton to="/workspace/people/staff" label="All team" />
        </ActionButtonRow>
      </div>
    </div>
  )
}
