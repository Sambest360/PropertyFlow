import type { Role } from '../types/domain'

/**
 * Staff roles an inviter may offer, highest privilege first.
 * Super admin is never offered. A role is included when it is at or below the inviter.
 */
const STAFF_INVITE_RANK: Partial<Record<Role, number>> = {
  super_admin: 100,
  client_admin: 80,
  agent_admin: 60,
  ground_agent: 40,
  agent: 20,
}

const OFFERABLE_ROLES: Role[] = ['client_admin', 'agent_admin', 'ground_agent', 'agent']

export function rolesInviterMayOffer(inviterRole: Role): Role[] {
  const rank = STAFF_INVITE_RANK[inviterRole] ?? 0
  return OFFERABLE_ROLES.filter((role) => {
    const roleRank = STAFF_INVITE_RANK[role] ?? 0
    return role !== 'super_admin' && roleRank <= rank && roleRank > 0
  })
}

export type InviteStaffInput = {
  email: string
  role: Role
  agencyId: string
  inviterRole: Role
}

export type InviteStaffDeps = {
  fetchImpl?: typeof fetch
  getAccessToken?: () => Promise<string | null>
  apiBase?: string
}

export async function inviteStaff(
  input: InviteStaffInput,
  deps: InviteStaffDeps = {},
): Promise<{ user_id: string }> {
  const email = input.email.trim()
  const agencyId = input.agencyId.trim()
  if (!email) throw new Error('Enter an email address.')
  if (!agencyId) throw new Error('Choose an agency.')
  if (input.role === 'super_admin' || !rolesInviterMayOffer(input.inviterRole).includes(input.role)) {
    throw new Error('You cannot invite this role.')
  }

  const getAccessToken = deps.getAccessToken
  if (!getAccessToken) throw new Error('Sign in again before inviting staff.')
  const token = await getAccessToken()
  if (!token) throw new Error('Sign in again before inviting staff.')

  const fetchImpl = deps.fetchImpl ?? fetch
  const base = deps.apiBase ?? ((import.meta.env.VITE_API_BASE as string | undefined) || '')
  const res = await fetchImpl(`${base}/invite`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      email,
      role: input.role,
      agency_id: agencyId,
    }),
  })

  const json = (await res.json().catch(() => ({}))) as { user_id?: string; message?: string; error?: string }
  if (!res.ok) {
    throw new Error(json.message || json.error || `Invite failed (${res.status})`)
  }
  if (!json.user_id) throw new Error('Invite did not return a user id.')
  return { user_id: String(json.user_id) }
}
