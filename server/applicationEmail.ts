/**
 * Sends the application-received email to the applicant stored on the user row.
 * The claim row is inserted in the same transaction as the send: a second caller
 * finds the conflict and does not send. A failed send rolls the claim back so a
 * later attempt can still deliver exactly one message.
 */
import { clientQuery, withTransaction } from './db.js'
import { sendApplicationReceived } from './mailtrap.js'

type ClaimedEmail = {
  recipient_email: string
  applicant_name: string
  property_title: string | null
  reference_code: string
}

const CLAIM_SQL = `
  WITH ins AS (
    INSERT INTO application_email_sends (application_id, kind, recipient_email)
    SELECT a.id, 'application_received', btrim(u.email)
    FROM applications a
    JOIN users u ON u.id = a.applicant_id
    WHERE a.id = $1::uuid
      AND u.email IS NOT NULL
      AND btrim(u.email) <> ''
    ON CONFLICT (application_id, kind) DO NOTHING
    RETURNING application_id, recipient_email
  )
  SELECT ins.recipient_email,
         btrim(u.first_name || ' ' || u.last_name) AS applicant_name,
         un.title AS property_title,
         a.reference_code
  FROM ins
  JOIN applications a ON a.id = ins.application_id
  JOIN users u ON u.id = a.applicant_id
  LEFT JOIN units un ON un.id = a.unit_id
`

export async function deliverApplicationReceivedEmail(applicationId: string): Promise<void> {
  try {
    await withTransaction(async (client) => {
      const rows = await clientQuery<ClaimedEmail>(client, CLAIM_SQL, [applicationId])
      const row = rows[0]
      if (!row) return
      const result = await sendApplicationReceived({
        email: row.recipient_email,
        applicantName: row.applicant_name || undefined,
        propertyTitle: row.property_title ?? undefined,
        referenceCode: row.reference_code,
      })
      if (!result.sent) {
        throw new Error(result.reason || 'email was not accepted')
      }
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[application-received] send failed:', message)
  }
}
