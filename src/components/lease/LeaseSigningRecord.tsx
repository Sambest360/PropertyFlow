import { useStore } from '../../context/AppStore'
import { useAuth } from '../../context/AuthContext'
import type { Tenancy } from '../../types/domain'
import { buildSigningRecord, type SigningRecordRow } from '../../lib/lease/signingRecord'

/** Roles that see the signer IP address and user agent (staff only). */
export const SIGN_DEVICE_ROLES: ReadonlySet<string> = new Set(['super_admin', 'client_admin', 'agent_admin', 'agent', 'ground_agent'])

export const SIGNING_RECORD_COPY = {
  title: 'Signing record',
  empty: 'No signatures recorded on this lease yet.',
} as const

/** Pure view (rendered in tests). IP and user agent only when showDevice. */
export function LeaseSigningRecordView({ rows, showDevice }: { rows: SigningRecordRow[]; showDevice: boolean }) {
  return (
    <section aria-label={SIGNING_RECORD_COPY.title} className="space-y-2">
      <h3 className="text-sm font-semibold text-ink-900">{SIGNING_RECORD_COPY.title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-500">{SIGNING_RECORD_COPY.empty}</p>
      ) : (
        <ul className="divide-y divide-primary-100 rounded-2xl border border-primary-100 bg-white">
          {rows.map((r) => (
            <li key={r.key} className="space-y-0.5 px-4 py-3 text-sm text-ink-700">
              <p className="font-medium text-ink-900">{r.who}</p>
              <p>
                {r.roleLabel} · {r.when} · {r.methodLabel}
              </p>
              <p className="text-xs text-ink-500">
                Envelope {r.envelopeId}
                {r.shortHash ? ` · Image hash ${r.shortHash}` : ''}
              </p>
              {r.confirmation ? <p className="text-xs text-ink-500">{r.confirmation}</p> : null}
              {showDevice && (r.ip || r.userAgent) ? (
                <p className="text-xs text-ink-400" data-testid="sign-device">
                  {r.ip ? `IP address ${r.ip}` : ''}
                  {r.ip && r.userAgent ? ' · ' : ''}
                  {r.userAgent ? `User agent ${r.userAgent}` : ''}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function LeaseSigningRecord({ tenancy }: { tenancy: Tenancy }) {
  const { state } = useStore()
  const { user } = useAuth()
  const name = (id: string | null | undefined) => (id ? state.users.find((u) => u.id === id)?.name ?? null : null)
  const rows = buildSigningRecord({
    tenancy,
    events: state.leaseSignEvents,
    userName: name,
    landlordName: name(tenancy.landlordId) ?? 'Landlord',
  })
  return <LeaseSigningRecordView rows={rows} showDevice={SIGN_DEVICE_ROLES.has(user.role)} />
}
