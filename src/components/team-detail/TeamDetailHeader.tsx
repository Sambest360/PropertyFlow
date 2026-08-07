import { Mail, Phone } from 'lucide-react'
import type { AppUser } from '../../types/domain'
import { ActionButtonRow } from '../ActionButtonRow'
import { BackButton } from '../BackButton'
import { Button } from '../ui'
import { ImpersonateUserButton } from '../admin/ImpersonateUserButton'
import { ICON_STROKE } from './types'

export function TeamDetailHeader({ user }: { user: AppUser }) {
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
          <ImpersonateUserButton target={user} />
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
