/** Hide assignee labels when the viewer is the assigned agent. */
export function isSelfAgent(
  viewerId: string | null | undefined,
  agentId: string | null | undefined,
): boolean {
  return Boolean(viewerId && agentId && viewerId === agentId)
}

export function agentAssigneeLabel(
  viewerId: string | null | undefined,
  agentId: string | null | undefined,
  name: string | null | undefined,
  fallback = 'Unassigned',
): string | null {
  if (isSelfAgent(viewerId, agentId)) return null
  return name?.trim() || fallback
}

export function shouldShowAgentAssignee(
  viewerId: string | null | undefined,
  agentId: string | null | undefined,
): boolean {
  return !isSelfAgent(viewerId, agentId)
}

export function agentMetaRow(
  viewerId: string | null | undefined,
  agentId: string | null | undefined,
  name: string | null | undefined,
  label = 'Agent',
  fallback = 'Unassigned',
): { label: string; value: string } | null {
  const value = agentAssigneeLabel(viewerId, agentId, name, fallback)
  if (value === null) return null
  return { label, value }
}

export function listedByAgentPhrase(
  viewerId: string | null | undefined,
  agentId: string | null | undefined,
  agentName: string | null | undefined,
  fallback = 'Agency agent',
): string | null {
  return agentAssigneeLabel(viewerId, agentId, agentName, fallback)
}

export function appendAgentMetaRow(
  rows: Array<{ label: string; value: string }>,
  viewerId: string | null | undefined,
  agentId: string | null | undefined,
  name: string | null | undefined,
  label = 'Agent',
  fallback = 'Unassigned',
): Array<{ label: string; value: string }> {
  const row = agentMetaRow(viewerId, agentId, name, label, fallback)
  return row ? [...rows, row] : rows
}

/** Agents selectable for a property — only the listing's linked agent. */
export function agentsForProperty(
  propertyAgentId: string | null | undefined,
  agents: Array<{ id: string; name: string }>,
): Array<{ id: string; name: string }> {
  if (!propertyAgentId) return []
  const linked = agents.find((a) => a.id === propertyAgentId)
  return linked ? [linked] : []
}

export function resolvePropertyAgentId(
  propertyAgentId: string | null | undefined,
  viewerId: string | null | undefined,
  defaultAgentId?: string | null,
): string {
  if (propertyAgentId) return propertyAgentId
  if (viewerId && defaultAgentId === viewerId) return viewerId
  return defaultAgentId ?? ''
}

/** Lock agent picker when the signed-in user is the property's linked agent. */
export function shouldLockPropertyAgentField(
  viewerId: string | null | undefined,
  propertyAgentId: string | null | undefined,
): boolean {
  return isSelfAgent(viewerId, propertyAgentId)
}
