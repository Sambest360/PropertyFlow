import { useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { isFieldAgent } from '../lib/permissions'
import {
  agentAssigneeLabel,
  agentMetaRow,
  isSelfAgent,
  listedByAgentPhrase,
  shouldShowAgentAssignee,
} from '../lib/agentDisplay'

export function useHideAgentColumn() {
  const { role } = useAuth()
  return isFieldAgent(role)
}

export function useAgentDisplay() {
  const { user } = useAuth()
  const viewerId = user.id

  return useMemo(
    () => ({
      viewerId,
      isSelf: (agentId: string | null | undefined) => isSelfAgent(viewerId, agentId),
      showAssignee: (agentId: string | null | undefined) => shouldShowAgentAssignee(viewerId, agentId),
      label: (
        agentId: string | null | undefined,
        name: string | null | undefined,
        fallback = 'Unassigned',
      ) => agentAssigneeLabel(viewerId, agentId, name, fallback),
      metaRow: (
        agentId: string | null | undefined,
        name: string | null | undefined,
        label = 'Agent',
        fallback = 'Unassigned',
      ) => agentMetaRow(viewerId, agentId, name, label, fallback),
      listedBy: (
        agentId: string | null | undefined,
        name: string | null | undefined,
        fallback = 'Agency agent',
      ) => listedByAgentPhrase(viewerId, agentId, name, fallback),
    }),
    [viewerId],
  )
}
