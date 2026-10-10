/**
 * "Applicant accepted elsewhere" notices, generated on the server.
 *
 * The client used to write these as notification rows addressed to other
 * agencies' staff (and to the applicant). The persist gate rightly refuses a
 * notification for another user (portal roles: own only; staff: own agency
 * only), so they were dropped silently. When an application moves into an
 * acceptance status the server now writes them itself, mirroring
 * src/lib/applicantAcceptance.ts notifyAcceptedElsewhere:
 *   - for every other open application by the same person (applicant id or
 *     email): the agent on it and that agency's client_admin / agent_admin /
 *     ground_agent staff get "Applicant accepted elsewhere";
 *   - the applicant gets "Update on your other application" per sibling.
 * Best effort: a failure here never fails the write that triggered it.
 */
import { randomUUID } from 'node:crypto'
import { query } from './db.js'

/**
 * Mirror of src/lib/applicantPortalActions.ts APPLICANT_ACCEPTANCE_STATUSES
 * (that module has extension-less imports, so the server bundle cannot load
 * it; pinned by a test).
 */
export const ACCEPTANCE_STATUSES: readonly string[] = [
  'conditionally_approved',
  'lease_generated',
  'lease_sent',
  'tenant_signed',
  'landlord_signed',
  'deposit_invoice_sent',
  'deposit_paid',
  'deposit_verified',
  'first_rent_paid',
  'rent_verified',
  'inspection_scheduled',
  'inspection_completed',
  'keys_ready',
  'keys_handed_over',
  'active_tenancy',
  'offer_accepted',
  'sale_agreement_signed',
]

const TERMINAL_DB_STATUSES = ['REJECTED', 'WITHDRAWN']
const TERMINAL_WORKFLOW = ['rejected', 'withdrawn', 'cancelled', 'closed', 'deposit_refunded', 'offer_rejected', 'bond_declined', 'completed']
const STAFF_DB_ROLES = ['AGENCY_ADMIN', 'AGENT_ADMIN', 'GROUND_AGENT']

export function isAcceptanceStatus(status: unknown): boolean {
  return typeof status === 'string' && ACCEPTANCE_STATUSES.includes(status)
}

type Accepted = {
  applicant_id: string | null
  email: string | null
  applicant_name: string | null
  unit_title: string | null
}
type Sibling = { id: string; fe: string | null; client_id: string | null; agent_id: string | null }

export async function notifyAcceptedElsewhereServer(applicationUuid: string): Promise<number> {
  try {
    const acc = (
      await query<Accepted>(
        `SELECT a.applicant_id::text AS applicant_id,
                LOWER(COALESCE(a.metadata->>'email', a.metadata->>'applicant_email')) AS email,
                COALESCE(a.metadata->>'applicantName', a.metadata->>'applicant_name') AS applicant_name,
                un.title AS unit_title
           FROM applications a LEFT JOIN units un ON un.id = a.unit_id
          WHERE a.id = $1::uuid`,
        [applicationUuid],
      )
    )[0]
    if (!acc || (!acc.applicant_id && !acc.email)) return 0
    const siblings = await query<Sibling>(
      `SELECT a.id::text AS id, a.metadata->>'frontend_id' AS fe,
              a.client_id::text AS client_id, a.agent_id::text AS agent_id
         FROM applications a
        WHERE a.id <> $1::uuid
          AND (($2::uuid IS NOT NULL AND a.applicant_id = $2::uuid)
               OR ($3::text IS NOT NULL AND LOWER(COALESCE(a.metadata->>'email', a.metadata->>'applicant_email')) = $3::text))
          AND a.status <> ALL($4::text[])
          AND COALESCE(a.metadata->>'workflow_status', '') <> ALL($5::text[])`,
      [applicationUuid, acc.applicant_id, acc.email, TERMINAL_DB_STATUSES, TERMINAL_WORKFLOW],
    )
    if (!siblings.length) return 0
    const clients = [...new Set(siblings.map((s) => s.client_id).filter(Boolean))] as string[]
    const staff = clients.length
      ? await query<{ id: string; client_id: string; role: string }>(
          `SELECT id::text AS id, client_id::text AS client_id, role
             FROM users WHERE client_id = ANY($1::uuid[]) AND active = TRUE AND role = ANY($2::text[])`,
          [clients, STAFF_DB_ROLES],
        )
      : []
    const name = acc.applicant_name || 'An applicant'
    const where = acc.unit_title || 'another property'
    let sent = 0
    const insert = async (userUuid: string, clientUuid: string | null, title: string, body: string, link: string) => {
      await query(
        `INSERT INTO notifications (id, client_id, user_id, title, body, link_path, resource_type, action_type)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, 'applicant', 'updated')`,
        [randomUUID(), clientUuid, userUuid, title, body, link],
      )
      sent += 1
    }
    for (const sib of siblings) {
      const appRef = encodeURIComponent(sib.fe || sib.id)
      const recipients = new Set<string>()
      if (sib.agent_id) recipients.add(sib.agent_id)
      for (const u of staff) if (u.client_id === sib.client_id) recipients.add(u.id)
      for (const userUuid of recipients) {
        await insert(
          userUuid,
          sib.client_id,
          'Applicant accepted elsewhere',
          `${name} was accepted at ${where}. Their application for your listing may no longer proceed.`,
          `/workspace/sales/applications/${appRef}`,
        )
      }
      if (acc.applicant_id) {
        await insert(
          acc.applicant_id,
          sib.client_id,
          'Update on your other application',
          `You were accepted at ${where}. Your application for another property is still open — the agency has been notified.`,
          `/workspace/portals/tenant/applications/${appRef}`,
        )
      }
    }
    return sent
  } catch (err) {
    console.error('[accepted-elsewhere]', err instanceof Error ? err.message : err)
    return 0
  }
}
