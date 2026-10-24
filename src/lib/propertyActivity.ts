/**
 * "Recent activity" ordering for the properties list: a property's position is
 * its latest moment, whether it was created, edited, or had a lead,
 * application, viewing, ticket, payment, lease, document, message or property
 * event. Timestamps are ISO strings or YYYY-MM-DD dates; both compare
 * correctly as strings. Future-dated values (a viewing booked for next week,
 * a lease that starts next month) count only once that moment has arrived.
 */

type Row = { propertyId?: string | null } & Record<string, unknown>

/** Activity sources and the timestamp fields that mark activity on each. */
const SOURCES: Array<{ key: string; fields: string[] }> = [
  { key: 'leads', fields: ['createdAt', 'updatedAt'] },
  { key: 'applications', fields: ['submittedAt', 'updatedAt'] },
  { key: 'viewings', fields: ['date'] },
  { key: 'payments', fields: ['paidAt'] },
  { key: 'tenancies', fields: ['startDate'] },
  { key: 'tickets', fields: ['openedAt', 'resolvedAt', 'escalatedAt', 'contractorAssignedAt'] },
  { key: 'propertyDocuments', fields: ['uploadedAt'] },
  { key: 'propertyEvents', fields: ['at'] },
  { key: 'threads', fields: ['updatedAt'] },
]

const PROPERTY_FIELDS = ['createdAt', 'updatedAt', 'liveManualAt', 'unpublishedAt']

const DATE_RE = /^\d{4}-\d{2}-\d{2}/

function latest(current: string, row: Record<string, unknown>, fields: string[], now: string): string {
  let best = current
  for (const f of fields) {
    const v = row[f]
    if (typeof v !== 'string' || !DATE_RE.test(v) || v > now) continue
    if (v > best) best = v
  }
  return best
}

/** Latest activity timestamp per property id ('' when nothing is known). */
export function latestActivityByProperty(
  state: { properties: Array<{ id: string } & object> } & Record<string, unknown>,
  now: string = new Date().toISOString(),
): Map<string, string> {
  const out = new Map<string, string>()
  for (const p of state.properties) {
    out.set(p.id, latest('', p as Record<string, unknown>, PROPERTY_FIELDS, now))
  }
  for (const { key, fields } of SOURCES) {
    const rows = state[key]
    if (!Array.isArray(rows)) continue
    for (const row of rows as Row[]) {
      const id = row?.propertyId
      if (!id || !out.has(id)) continue
      out.set(id, latest(out.get(id)!, row, fields, now))
    }
  }
  return out
}
