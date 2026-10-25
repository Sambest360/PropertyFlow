import { useMemo, useState } from 'react'
import { useStore } from '../context/AppStore'
import { useAuth } from '../context/AuthContext'
import { getAvailableTransitions } from '../lib/applicationWorkflow'
import { rolePermissions } from '../lib/permissions'
import type { Application } from '../types/domain'

/** Owner approve / decline on an application sent for landlord review. */
export function useLandlordDecision() {
  const { state, advanceApplicationWorkflow } = useStore()
  const { user } = useAuth()
  const [busyAppId, setBusyAppId] = useState<string | null>(null)
  const perms = useMemo(() => rolePermissions.landlord, [])

  const options = (app: Application) => {
    const actions = getAvailableTransitions(app, perms)
    return {
      canApprove: actions.some((t) => t.to === 'conditionally_approved'),
      canReject: actions.some((t) => t.to === 'rejected'),
    }
  }

  async function decide(applicationId: string, targetStatus: 'conditionally_approved' | 'rejected') {
    const app = state.applications.find((a) => a.id === applicationId)
    if (!app) return
    const transition = getAvailableTransitions(app, perms).find((t) => t.to === targetStatus)
    if (!transition) return
    if (transition.confirm && typeof window !== 'undefined' && !window.confirm(transition.confirm)) return
    setBusyAppId(applicationId)
    try {
      await advanceApplicationWorkflow({ applicationId, actorUserId: user.id, targetStatus })
    } finally {
      setBusyAppId(null)
    }
  }

  return { busyAppId, options, decide }
}
