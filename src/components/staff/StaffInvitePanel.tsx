import { useMemo, useState, type FormEvent } from 'react'
import { useStore } from '../../context/AppStore'
import { useAuth } from '../../context/AuthContext'
import { staffInviteEnabled } from '../../lib/featureFlags'
import { roleLabels } from '../../lib/permissions'
import { inviteStaff, rolesInviterMayOffer } from '../../lib/staffInvite'
import { createClient } from '../../utils/supabase/client'
import { isSupabaseConfigured } from '../../utils/supabase/env'
import { Button, Card, Input, Select } from '../ui'
import type { Role } from '../../types/domain'

export function StaffInvitePanel() {
  const { user } = useAuth()
  const { state } = useStore()
  const roles = useMemo(() => rolesInviterMayOffer(user.role), [user.role])
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role | ''>(roles[0] ?? '')
  const [agencyId, setAgencyId] = useState(user.agencyId ?? state.agencies[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)

  if (!staffInviteEnabled() || roles.length === 0) return null

  const agencies = user.role === 'super_admin' ? state.agencies : state.agencies.filter((a) => a.id === user.agencyId)
  const lockedAgency = user.role !== 'super_admin'

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setUserId(null)
    if (!role) {
      setError('Choose a role.')
      return
    }
    if (!isSupabaseConfigured()) {
      setError('Sign in with a configured session before inviting staff.')
      return
    }
    setBusy(true)
    try {
      const result = await inviteStaff(
        {
          email,
          role,
          agencyId,
          inviterRole: user.role,
        },
        {
          getAccessToken: async () => {
            const { data } = await createClient().auth.getSession()
            return data.session?.access_token ?? null
          },
        },
      )
      setUserId(result.user_id)
      setEmail('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invite failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="p-5">
      <h2 className="font-display text-lg font-semibold text-ink">Invite staff</h2>
      <p className="mt-1 text-sm text-ink-500">
        Send an invite for a role at or below yours. Super admin cannot be invited here.
      </p>
      <form onSubmit={onSubmit} className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-ink" htmlFor="staff-invite-email">
          Email
          <Input
            id="staff-invite-email"
            className="mt-1 min-h-11"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label className="block text-sm font-medium text-ink" htmlFor="staff-invite-role">
          Role
          <Select
            id="staff-invite-role"
            className="mt-1 min-h-11 w-full"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            required
          >
            {roles.map((item) => (
              <option key={item} value={item}>
                {roleLabels[item]}
              </option>
            ))}
          </Select>
        </label>
        <label className="block text-sm font-medium text-ink sm:col-span-2" htmlFor="staff-invite-agency">
          Agency
          <Select
            id="staff-invite-agency"
            className="mt-1 min-h-11 w-full"
            value={agencyId}
            onChange={(e) => setAgencyId(e.target.value)}
            disabled={lockedAgency}
            required
          >
            {agencies.map((agency) => (
              <option key={agency.id} value={agency.id}>
                {agency.name}
              </option>
            ))}
          </Select>
        </label>
        <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
          <Button type="submit" className="min-h-11 cursor-pointer" disabled={busy}>
            {busy ? 'Sending invite…' : 'Send invite'}
          </Button>
          {userId ? (
            <p className="text-sm text-emerald-700" role="status">
              Invite sent. User id {userId}.
            </p>
          ) : null}
          {error ? (
            <p className="text-sm text-accent-700" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </form>
    </Card>
  )
}
