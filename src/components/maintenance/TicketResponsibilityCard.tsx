import { useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import type { MaintenanceTicket } from '../../types/domain'
import { Badge, Button, Select, Textarea } from '../ui'
import {
  RESPONSIBLE_PARTIES,
  RESPONSIBLE_PARTY_LABEL,
  type ResponsibleParty,
} from '../../lib/maintenanceRules'
import {
  forwardTicketToBodyCorporate,
  mailtoFromDraft,
  overrideTicketResponsibility,
} from '../../lib/api/maintenanceRules'

export const RESPONSIBLE_FILTER_OPTIONS: ReadonlyArray<{ value: 'all' | ResponsibleParty | 'unset'; label: string }> = [
  { value: 'all', label: 'Anyone responsible' },
  ...RESPONSIBLE_PARTIES.map((p) => ({ value: p, label: RESPONSIBLE_PARTY_LABEL[p] })),
  { value: 'unset', label: 'Not set (Emergency / Other)' },
]

export type ResponsibleFilter = (typeof RESPONSIBLE_FILTER_OPTIONS)[number]['value']

export function matchesResponsibleFilter(t: MaintenanceTicket, f: ResponsibleFilter): boolean {
  if (f === 'all') return true
  if (f === 'unset') return !t.responsibleParty
  return t.responsibleParty === f
}

export function ResponsiblePartyBadge({ ticket }: { ticket: MaintenanceTicket }) {
  return (
    <>
      {ticket.responsibleParty ? (
        <Badge tone={ticket.responsibleParty === 'TENANT' ? 'warning' : 'info'}>
          {RESPONSIBLE_PARTY_LABEL[ticket.responsibleParty]}
        </Badge>
      ) : null}
      {ticket.isSafetyFlag ? (
        <Badge tone="danger">
          <ShieldAlert className="h-3 w-3" aria-hidden /> Safety
        </Badge>
      ) : null}
    </>
  )
}

/**
 * Staff view of who is responsible (rule snapshot), the override (reason
 * required, audited on the server) and, for common property, the forward to
 * the body corporate as an email draft.
 */
export function TicketResponsibilityCard({
  ticket,
  canManage,
  onChanged,
}: {
  ticket: MaintenanceTicket
  canManage: boolean
  onChanged: (patch: Partial<MaintenanceTicket>) => void
}) {
  const [editing, setEditing] = useState(false)
  const [party, setParty] = useState<ResponsibleParty>(ticket.responsibleParty ?? 'LANDLORD')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const save = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const r = await overrideTicketResponsibility(ticket.id, party, reason.trim())
      onChanged({ responsibleParty: r.responsibleParty, overrideReason: r.overrideReason })
      setEditing(false)
      setReason('')
      setMsg('Responsibility updated and logged on the ticket.')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not change responsibility.')
    } finally {
      setBusy(false)
    }
  }

  const forward = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const r = await forwardTicketToBodyCorporate(ticket.id)
      window.location.href = mailtoFromDraft(r.emailDraft)
      setMsg(r.emailDraft.to ? `Email drafted to ${r.emailDraft.to}.` : 'Email drafted; add the managing agent’s address.')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not draft the email.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-primary-100 px-3 py-3 text-sm" data-testid="ticket-responsibility">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-ink-400">Responsible</span>
        <span className="font-medium text-ink">
          {ticket.responsibleParty ? RESPONSIBLE_PARTY_LABEL[ticket.responsibleParty] : 'Not set (agent to check)'}
        </span>
        <ResponsiblePartyBadge ticket={{ ...ticket, responsibleParty: null }} />
      </div>
      {ticket.overrideReason ? <p className="text-xs text-ink-500">Changed by staff: {ticket.overrideReason}</p> : null}
      {canManage ? (
        <div className="flex flex-wrap gap-2">
          {ticket.responsibleParty === 'BODY_CORPORATE' ? (
            <Button size="sm" disabled={busy} onClick={() => void forward()}>
              Forward to body corporate
            </Button>
          ) : null}
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => setEditing((v) => !v)}>
            {editing ? 'Cancel' : 'Change responsibility'}
          </Button>
        </div>
      ) : null}
      {editing ? (
        <div className="space-y-2">
          <Select value={party} onChange={(e) => setParty(e.target.value as ResponsibleParty)}>
            {RESPONSIBLE_PARTIES.map((p) => (
              <option key={p} value={p}>
                {RESPONSIBLE_PARTY_LABEL[p]}
              </option>
            ))}
          </Select>
          <Textarea
            placeholder="Reason (required, kept on the ticket's audit trail)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <Button size="sm" disabled={busy || reason.trim().length < 3} onClick={() => void save()}>
            Save change
          </Button>
        </div>
      ) : null}
      {msg ? <p className="text-xs text-ink-500">{msg}</p> : null}
    </div>
  )
}
