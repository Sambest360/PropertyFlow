/**
 * CR10 part 5: the "Signing record" rows for a lease. Prefers the server
 * lease_signed rows; falls back to the server-set stamp on the stored eSign
 * party blocks when the audit rows are not loaded. Pure, unit-tested.
 */
import type { LeaseSignEvent, Tenancy } from '../../types/domain'
import { SIGN_METHOD_LABELS, type SignMethod } from './signaturePrefill'
import type { LeaseESignParty } from './types'

export type SigningRecordRow = {
  key: string
  party: 'tenant' | 'landlord'
  /** e.g. "Tess Tenant" or "Signed by Sam Staff for Lerato Landlord (on behalf)". */
  who: string
  roleLabel: string
  when: string
  methodLabel: string
  envelopeId: string
  shortHash: string | null
  confirmation: string | null
  ip: string | null
  userAgent: string | null
}

const ROLE_LABELS: Record<string, string> = {
  tenant: 'Tenant',
  landlord: 'Landlord',
  client_admin: 'Agency admin',
  agent_admin: 'Agency admin',
  agent: 'Agent',
  ground_agent: 'Ground agent',
}

/** Date-time in SAST (Africa/Johannesburg). */
export function formatSast(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const s = new Intl.DateTimeFormat('en-ZA', {
    timeZone: 'Africa/Johannesburg',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d)
  return `${s} SAST`
}

export function methodLabel(m: string | null | undefined): string {
  return m && m in SIGN_METHOD_LABELS ? SIGN_METHOD_LABELS[m as SignMethod] : '—'
}

export function buildSigningRecord(input: {
  tenancy: Tenancy
  events: LeaseSignEvent[] | undefined
  userName: (id: string | null | undefined) => string | null
  landlordName: string
}): SigningRecordRow[] {
  const { tenancy, userName, landlordName } = input
  const partyName = (party: 'tenant' | 'landlord') => (party === 'tenant' ? tenancy.tenantName || 'Tenant' : landlordName)
  const row = (e: {
    key: string
    party: 'tenant' | 'landlord'
    signerUserId?: string | null
    role?: string | null
    method?: string | null
    onBehalf?: boolean
    confirmation?: string | null
    at?: string | null
    envelopeId?: string | null
    hash?: string | null
    ip?: string | null
    userAgent?: string | null
  }): SigningRecordRow => {
    const signer = userName(e.signerUserId) ?? (e.onBehalf ? 'Agency staff' : partyName(e.party))
    const who = e.onBehalf ? `Signed by ${signer} for ${partyName(e.party)} (on behalf)` : signer
    const roleLabel = e.onBehalf
      ? e.party === 'landlord'
        ? 'Staff on behalf of landlord'
        : 'Staff (paper lease)'
      : ROLE_LABELS[String(e.role ?? e.party)] ?? (e.party === 'tenant' ? 'Tenant' : 'Landlord')
    return {
      key: e.key,
      party: e.party,
      who,
      roleLabel,
      when: formatSast(e.at),
      methodLabel: methodLabel(e.method),
      envelopeId: e.envelopeId || '—',
      shortHash: e.hash ? e.hash.slice(0, 12) : null,
      confirmation: e.confirmation ?? null,
      ip: e.ip ?? null,
      userAgent: e.userAgent ?? null,
    }
  }
  const mine = (input.events ?? []).filter((e) => e.tenancyId === tenancy.id)
  if (mine.length) {
    return mine
      .slice()
      .sort((a, b) => String(a.signedAt ?? '').localeCompare(String(b.signedAt ?? '')))
      .map((e) =>
        row({
          key: e.id,
          party: e.party,
          signerUserId: e.signerUserId,
          role: e.role,
          method: e.method,
          onBehalf: e.onBehalf,
          confirmation: e.onBehalfConfirmation,
          at: e.signedAt,
          envelopeId: e.envelopeId,
          hash: e.imageSha256,
          ip: e.ip,
          userAgent: e.userAgent,
        }),
      )
  }
  const eSign = tenancy.eSign
  if (!eSign) return []
  const out: SigningRecordRow[] = []
  for (const party of ['tenant', 'landlord'] as const) {
    const b = eSign[party] as LeaseESignParty | null | undefined
    if (!b || b.status !== 'signed' || !b.signerUserId) continue
    out.push(
      row({
        key: `${eSign.envelopeId}-${party}`,
        party,
        signerUserId: b.signerUserId,
        role: b.signerRole,
        method: b.method,
        onBehalf: b.onBehalf,
        confirmation: b.onBehalfConfirmation,
        at: b.signedAt,
        envelopeId: eSign.envelopeId,
        hash: b.imageSha256,
        ip: b.ip,
        userAgent: b.userAgent,
      }),
    )
  }
  return out
}
