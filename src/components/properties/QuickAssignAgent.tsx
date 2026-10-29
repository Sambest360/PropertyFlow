/**
 * Inline "Assign agent" picker for an unassigned property (Properties list).
 * Only shown to people who can assign (agency administrators / principals /
 * super admins); assigning waits for the server and reports a refusal.
 */
import { useMemo, useState } from 'react'
import { Loader2, UserPlus } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useStore } from '../../context/AppStore'
import type { PropertyAsset } from '../../types/domain'
import { sweetSuccess, sweetWarning } from '../../lib/sweetAlert'

const AGENT_ROLES = new Set(['ground_agent', 'agent_admin', 'agent'])

export function useCanAssignAgents(): boolean {
  const { has } = useAuth()
  return has('platform.manage') || has('users.manage')
}

export function QuickAssignAgent({ property }: { property: PropertyAsset }) {
  const { state, assignPropertyAgent } = useStore()
  const [busy, setBusy] = useState(false)
  const agents = useMemo(
    () =>
      state.users
        .filter((u) => u.active !== false && AGENT_ROLES.has(u.role) && u.agencyId === property.agencyId)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [state.users, property.agencyId],
  )

  const onPick = async (agentId: string) => {
    if (!agentId) return
    setBusy(true)
    const res = await assignPropertyAgent(property.id, agentId)
    setBusy(false)
    if (res.ok === false) {
      await sweetWarning('Agent not assigned', res.reason)
      return
    }
    const name = agents.find((a) => a.id === agentId)?.name ?? 'the agent'
    await sweetSuccess('Agent assigned', `${property.title} is now assigned to ${name}.`)
  }

  if (busy) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-ink-500" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Assigning…
      </span>
    )
  }
  if (!agents.length) return <span className="text-sm text-ink-500">Unassigned</span>
  return (
    <label
      className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-primary-300 bg-primary-50/50 px-2 py-1 text-sm font-medium text-primary"
      onClick={(e) => e.stopPropagation()}
    >
      <UserPlus className="h-4 w-4 shrink-0" aria-hidden />
      <span className="sr-only">Assign an agent to {property.title}</span>
      <select
        className="max-w-[10rem] cursor-pointer bg-transparent text-sm font-medium text-primary focus:outline-none"
        value=""
        onChange={(e) => void onPick(e.target.value)}
        onClick={(e) => e.stopPropagation()}
      >
        <option value="">Assign agent</option>
        {agents.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
    </label>
  )
}
