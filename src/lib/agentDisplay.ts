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

/**
 * Listing headline "<type> · listed by <name>". When the public listing has no
 * name (027 listed_by is NULL: no agent, or the name failed the allowlist)
 * the "listed by" part is hidden, never replaced by a placeholder.
 */
export function listingHeadline(
  type: string,
  viewerId: string | null | undefined,
  agentId: string | null | undefined,
  agentName: string | null | undefined,
): string {
  const by = listedByAgentPhrase(viewerId, agentId, agentName, '')
  return by ? `${type} · listed by ${by}` : type
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

/** Minimal shapes so callers can pass store rows directly. */
export type ApplicationAgentRef = {
  id: string
  agentId?: string | null
}

/**
 * P0-agent (R8): the agent shown on an application is ALWAYS the listing's
 * real assigned agent — never the application row's own agent_id, which an
 * earlier round's write path could persist from a stale/defaulted value (the
 * "James Okonkwo with no assignment" symptom). No listing → no agent claim
 * at all; a listing without an agent → null (the UI renders "Unassigned").
 */
export function resolveApplicationAgentName(
  property: { agentId: string | null | undefined } | null | undefined,
  application: ApplicationAgentRef | null | undefined,
  users: Array<{ id: string; name: string }>,
): string | null {
  // P0-agent (R8): `application` is accepted for call-site symmetry (both
  // detail pages pass the row) but deliberately unused — the listing's agent
  // is the ONLY source; reading the row is how the phantom agent leaked.
  void application
  if (!property) return null
  const listingAgentId = property.agentId?.trim() || ''
  if (!listingAgentId) return null
  return users.find((u) => u.id === listingAgentId)?.name?.trim() || null
}
