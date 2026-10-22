import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../context/AppStore'
import { useAuth } from '../context/AuthContext'
import {
  buildLeadThreadCreateInput,
  findExistingLeadThread,
  resolveLeadPortalUser,
} from '../lib/leadContact'
import type { Lead, PropertyAsset } from '../types/domain'

const COMMUNICATIONS_PATH = '/workspace/operations/communications'

export function useLeadContact(lead: Lead, property: PropertyAsset | null) {
  const navigate = useNavigate()
  const { user, has } = useAuth()
  const { state, createThread, addActivity } = useStore()
  const [composeOpen, setComposeOpen] = useState(false)

  const portalUser = useMemo(
    () => resolveLeadPortalUser(state.users, lead, state.applications),
    [state.users, state.applications, lead],
  )

  const canContact = has('leads.view')
  const canInApp = has('messages.manage')

  const openThread = useCallback(
    (threadId: string) => {
      navigate(`${COMMUNICATIONS_PATH}?thread=${encodeURIComponent(threadId)}`)
    },
    [navigate],
  )

  const startInApp = useCallback(() => {
    if (!portalUser || !canInApp) return
    const existing = findExistingLeadThread(state.threads, lead, portalUser.id)
    if (existing) {
      openThread(existing.id)
      return
    }
    setComposeOpen(true)
  }, [portalUser, canInApp, state.threads, lead, openThread])

  const sendFirstMessage = useCallback(
    (initialMessage: string) => {
      if (!portalUser) return
      const input = buildLeadThreadCreateInput({
        lead,
        property,
        portalUserId: portalUser.id,
        currentUserId: user.id,
        initialMessage,
      })
      const thread = createThread(input)
      addActivity(`Contacted ${lead.name} via in-app message`, user.name, lead.agencyId)
      openThread(thread.id)
    },
    [portalUser, lead, property, user.id, user.name, createThread, addActivity, openThread],
  )

  return {
    portalUser,
    canContact,
    canInApp,
    composeOpen,
    setComposeOpen,
    startInApp,
    sendFirstMessage,
  }
}
