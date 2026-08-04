import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useStore } from '../context/AppStore'
import { canImpersonateUser, postImpersonatePath } from '../lib/impersonation'
import type { AppUser } from '../types/domain'

export function useImpersonateUser() {
  const { impersonate, user, realUser, isImpersonating } = useAuth()
  const { state } = useStore()
  const navigate = useNavigate()

  const actor = isImpersonating ? realUser : user
  const actorAgencyEnabled = state.agencies.find((a) => a.id === actor.agencyId)?.enabledPermissions

  const canImpersonate = (target: AppUser) =>
    canImpersonateUser(actor, target, actorAgencyEnabled)

  const impersonateUser = (target: AppUser) => {
    if (!canImpersonateUser(actor, target, actorAgencyEnabled)) return false
    const ok = impersonate(target.id)
    if (ok) navigate(postImpersonatePath(target.role))
    return ok
  }

  return { canImpersonate, impersonateUser, actor }
}
