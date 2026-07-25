import type { PropertyEvent } from '../types/domain'
import {
  seedApplications,
  seedPayments,
  seedTickets,
  seedUsers,
  seedViewings,
  uid,
} from '../data/seed'

function actorName(userId: string | null | undefined, fallback: string) {
  if (!userId) return fallback
  return seedUsers.find((u) => u.id === userId)?.name ?? fallback
}

/** Seed a Jira-style history stream from existing demo entities */
export function buildSeedPropertyEvents(): PropertyEvent[] {
  const events: PropertyEvent[] = []

  for (const v of seedViewings) {
    events.push({
      id: uid('pe'),
      agencyId: v.agencyId,
      propertyId: v.propertyId,
      actorUserId: v.agentId,
      actorName: actorName(v.agentId, 'Agent'),
      action: v.status === 'Scheduled' ? 'scheduled a Viewing' : `updated Viewing to ${v.status}`,
      at: `${v.date}T${v.time.length === 5 ? `${v.time}:00` : v.time}.000Z`,
      changes: [
        { field: 'Applicant', from: 'None', to: v.applicantName },
        { field: 'Status', from: '—', to: v.status },
      ],
    })
  }

  for (const a of seedApplications) {
    events.push({
      id: uid('pe'),
      agencyId: a.agencyId,
      propertyId: a.propertyId,
      actorUserId: a.agentId,
      actorName: actorName(a.agentId, a.applicantName),
      action: 'created an Application',
      at: `${a.submittedAt}T09:00:00.000Z`,
      changes: [
        { field: 'Applicant', from: 'None', to: a.applicantName },
        { field: 'Stage', from: 'None', to: a.stage },
      ],
    })
    if (a.stage !== 'Started' && a.updatedAt !== a.submittedAt) {
      events.push({
        id: uid('pe'),
        agencyId: a.agencyId,
        propertyId: a.propertyId,
        actorUserId: a.agentId,
        actorName: actorName(a.agentId, 'Agent'),
        action: 'changed the Application stage',
        at: `${a.updatedAt}T14:00:00.000Z`,
        changes: [{ field: 'Stage', from: 'Started', to: a.stage }],
      })
    }
  }

  for (const t of seedTickets) {
    events.push({
      id: uid('pe'),
      agencyId: t.agencyId,
      propertyId: t.propertyId,
      actorUserId: t.reportedByUserId,
      actorName: t.reportedBy,
      action: 'created a Maintenance ticket',
      at: t.openedAtIso ?? `${t.openedAt}T08:00:00.000Z`,
      changes: [
        { field: 'Priority', from: 'None', to: t.priority },
        { field: 'Status', from: 'None', to: t.status },
      ],
    })
  }

  for (const p of seedPayments) {
    events.push({
      id: uid('pe'),
      agencyId: p.agencyId,
      propertyId: p.propertyId,
      actorUserId: p.partyUserId,
      actorName: p.partyName,
      action: p.status === 'Paid' ? 'recorded a Payment' : 'created a Payment due',
      at: `${(p.paidAt ?? p.dueDate)}T10:00:00.000Z`,
      changes: [
        { field: 'Type', from: 'None', to: p.type },
        { field: 'Status', from: 'None', to: p.status },
      ],
    })
  }

  // Listing lifecycle samples
  events.push(
    {
      id: 'pe-pr1003-offer',
      agencyId: 'ag-horizon',
      propertyId: 'PR-1003',
      actorUserId: 'u-priya',
      actorName: 'Priya Naidoo',
      action: 'changed the Status',
      at: '2026-07-18T11:20:00.000Z',
      changes: [{ field: 'Status', from: 'Published', to: 'Under Offer' }],
    },
    {
      id: 'pe-pr1002-feat',
      agencyId: 'ag-horizon',
      propertyId: 'PR-1002',
      actorUserId: 'u-james',
      actorName: 'James Okonkwo',
      action: 'changed the Status',
      at: '2026-07-10T09:15:00.000Z',
      changes: [{ field: 'Status', from: 'Published', to: 'Featured' }],
    },
    {
      id: 'pe-pr1001-create',
      agencyId: 'ag-horizon',
      propertyId: 'PR-1001',
      actorUserId: 'u-lerato',
      actorName: 'Lerato Nkosi',
      action: 'created the Property',
      at: '2026-06-01T08:00:00.000Z',
    },
  )

  return events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
}
