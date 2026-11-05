/**
 * Which notifications are also sent as an SMS. Texts cost money and interrupt
 * people, so only time-sensitive steps where someone has to act (or turn up)
 * qualify. Everything else stays in the app and email.
 *
 * When Lekaya Rentals sends an SMS:
 *  - Viewings: booked/confirmed, rescheduled, cancelled, reminder
 *  - Applications: approved, conditionally approved, declined
 *  - Leases: sent for signing, fully signed
 *  - Deposits: deposit invoice / details sent, deposit received
 *  - Move-in: move-in date / keys / PCR inspection booked
 *  - Rent: overdue, arrears, final demand
 *  - Maintenance: a contractor is assigned or a job is booked
 *  - Escalations: urgent / overdue escalations
 *  - Account: new tenant added to a property (onboarding)
 */
export type SmsRule = { id: string; label: string; match: RegExp }

export const SMS_RULES: SmsRule[] = [
  { id: 'viewing', label: 'Viewing booked, moved, cancelled or due', match: /viewing.*(confirm|book|resched|moved|cancel|remind|tomorrow|today)|(confirm|book|resched|cancel).*viewing/i },
  { id: 'application', label: 'Application decision', match: /application.*(approv|declin|reject|condition)|(approv|declin|reject|condition).*application/i },
  { id: 'lease', label: 'Lease ready to sign or signed', match: /lease.*(sign|sent|ready)|sign.*lease/i },
  { id: 'deposit', label: 'Deposit details or payment', match: /deposit.*(invoice|details|issued|due|received|confirm)/i },
  { id: 'move_in', label: 'Move-in day', match: /move[- ]?in|keys|occupation date/i },
  { id: 'rent', label: 'Rent overdue', match: /overdue|arrears|final demand|rent.*(late|missed|due)/i },
  { id: 'job', label: 'Contractor job', match: /(contractor|job).*(assign|book|scheduled)|assigned.*(job|maintenance|ticket)/i },
  { id: 'escalation', label: 'Urgent escalation', match: /escalat.*(urgent|overdue|critical)|urgent/i },
  { id: 'tenant_added', label: 'Added to a property', match: /added (you )?(as a )?tenant|you('ve| have) been added/i },
]

/** The rule a notification matches, or null when it should not be texted. */
export function smsRuleFor(n: { title?: string | null; body?: string | null; resource_type?: string | null; action_type?: string | null }): SmsRule | null {
  const hay = [n.resource_type, n.action_type, n.title].filter(Boolean).join(' ')
  return SMS_RULES.find((r) => r.match.test(hay)) ?? null
}

/** South African numbers to E.164 without the plus (Brevo wants e.g. 27821234567). */
export function normalizeSmsNumber(raw: string | null | undefined): string | null {
  const digits = String(raw ?? '').replace(/[^\d+]/g, '')
  if (!digits) return null
  let d = digits.startsWith('+') ? digits.slice(1) : digits
  if (d.startsWith('00')) d = d.slice(2)
  if (d.startsWith('0') && d.length === 10) d = `27${d.slice(1)}`
  return /^\d{10,15}$/.test(d) ? d : null
}

/** One short text: title, a trimmed line of body, and the link. Kept under 300 characters. */
export function smsText(title: string, body: string, link?: string | null): string {
  const base = `Lekaya Rentals: ${title.trim()}`
  const tail = link ? ` ${link}` : ''
  const room = 300 - base.length - tail.length - 3
  const b = body.trim().replace(/\s+/g, ' ')
  const mid = b && room > 20 ? ` - ${b.length > room ? `${b.slice(0, room - 1)}…` : b}` : ''
  return `${base}${mid}${tail}`
}
