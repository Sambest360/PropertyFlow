import { describe, expect, it } from 'vitest'
import { buildDefaultSuiteAlerts } from './suiteAlerts'
import type { AppUser, Application, Lead, MaintenanceTicket, MessageThread, PropertyAsset, Viewing } from '../types/domain'
import {
  agencyAdminIds,
  agencyStaffUsers,
  applySuiteAlertFilter,
  applicationStakeholderIds,
  excludeActorFromIds,
  leadStakeholderIds,
  maintenanceDeskStakeholderIds,
  messageThreadRecipientIds,
  propertyDeskStakeholderIds,
  uniqueIds,
  viewingDeskStakeholderIds,
} from './notificationRecipients'

const users: AppUser[] = [
  {
    id: 'admin-1',
    name: 'Principal',
    email: 'principal@test.co.za',
    role: 'client_admin',
    agencyId: 'ag-1',
    active: true,
    enabledPermissions: [],
    licenseStatus: 'principal',
  },
  {
    id: 'agent-a',
    name: 'Agent A',
    email: 'agenta@test.co.za',
    role: 'agent',
    agencyId: 'ag-1',
    active: true,
    enabledPermissions: [],
    licenseStatus: 'candidate',
  },
  {
    id: 'agent-b',
    name: 'Agent B',
    email: 'agentb@test.co.za',
    role: 'agent',
    agencyId: 'ag-1',
    active: true,
    enabledPermissions: [],
    licenseStatus: 'candidate',
  },
  {
    id: 'tenant-1',
    name: 'Tenant',
    email: 'tenant@test.co.za',
    role: 'tenant',
    agencyId: 'ag-1',
    active: true,
    enabledPermissions: [],
    licenseStatus: 'n/a',
  },
  {
    id: 'landlord-1',
    name: 'Landlord',
    email: 'landlord@test.co.za',
    role: 'landlord',
    agencyId: 'ag-1',
    active: true,
    enabledPermissions: [],
    licenseStatus: 'n/a',
  },
]

const property: PropertyAsset = {
  id: 'PR-1',
  agencyId: 'ag-1',
  landlordId: 'landlord-1',
  agentId: 'agent-a',
  title: 'Flat 1',
  type: 'Apartment',
  status: 'Published',
  listingMode: 'rent',
  price: null,
  rent: 12000,
  beds: 2,
  baths: 1,
  parking: 1,
  area: 80,
  city: 'Cape Town',
  suburb: 'Sea Point',
  address: '1 Main Rd',
  lat: -33.9,
  lng: 18.4,
  images: [],
  rooms: [],
}

describe('notificationRecipients', () => {
  it('propertyDeskStakeholderIds returns listing agent and admins only', () => {
    const ids = propertyDeskStakeholderIds(users, property)
    expect(ids).toContain('agent-a')
    expect(ids).toContain('admin-1')
    expect(ids).not.toContain('agent-b')
    expect(ids).not.toContain('tenant-1')
  })

  it('dedupes when agent is also an admin', () => {
    const adminAgent: AppUser = { ...users[1], id: 'admin-agent', role: 'client_admin' }
    const roster = [...users, adminAgent]
    const ids = propertyDeskStakeholderIds(roster, { ...property, agentId: 'admin-agent' })
    expect(ids.filter((id) => id === 'admin-agent')).toHaveLength(1)
  })

  it('leadStakeholderIds includes lead agent, property agent, and admins', () => {
    const lead: Lead = {
      id: 'LD-1',
      agencyId: 'ag-1',
      propertyId: property.id,
      agentId: 'agent-b',
      name: 'Sam',
      email: 'sam@test.co.za',
      phone: '082',
      channel: 'Web',
      stage: 'New Lead',
      type: 'Rent',
      value: 0,
      notes: '',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    }
    const ids = leadStakeholderIds(users, lead, property)
    expect(ids).toEqual(expect.arrayContaining(['agent-b', 'agent-a', 'admin-1']))
    expect(ids).not.toContain('tenant-1')
  })

  it('viewingDeskStakeholderIds scopes to viewing agent and property agent', () => {
    const viewing: Viewing = {
      id: 'VW-1',
      agencyId: 'ag-1',
      propertyId: property.id,
      agentId: 'agent-b',
      slotId: null,
      applicantName: 'Sam',
      date: '2026-08-10',
      time: '10:00',
      status: 'Scheduled',
      attendance: '—',
    }
    const ids = viewingDeskStakeholderIds(users, viewing, property)
    expect(ids).toContain('agent-b')
    expect(ids).toContain('agent-a')
    expect(ids).toContain('admin-1')
    expect(ids).not.toContain('tenant-1')
  })

  it('messageThreadRecipientIds returns participants except sender', () => {
    const thread: Pick<MessageThread, 'participantIds'> = {
      participantIds: ['agent-a', 'tenant-1', 'landlord-1'],
    }
    expect(messageThreadRecipientIds(thread, 'agent-a')).toEqual(['tenant-1', 'landlord-1'])
  })

  it('maintenanceDeskStakeholderIds includes assigned agent and admins', () => {
    const ticket: Pick<MaintenanceTicket, 'agencyId' | 'assignedAgentId' | 'propertyId'> = {
      agencyId: 'ag-1',
      assignedAgentId: 'agent-b',
      propertyId: property.id,
    }
    const ids = maintenanceDeskStakeholderIds(users, ticket, property)
    expect(ids).toEqual(expect.arrayContaining(['agent-b', 'agent-a', 'admin-1']))
  })

  it('agencyStaffUsers excludes portal roles for broadcast audience', () => {
    const staff = agencyStaffUsers(users, 'ag-1')
    expect(staff.map((u) => u.id)).toEqual(expect.arrayContaining(['admin-1', 'agent-a', 'agent-b']))
    expect(staff.some((u) => u.role === 'tenant' || u.role === 'landlord')).toBe(false)
  })

  it('applySuiteAlertFilter respects notifyRoles on explicit recipients', () => {
    const rule = buildDefaultSuiteAlerts('ag-1').find((r) => r.resource === 'property')!
    const restrictedRule = { ...rule, notifyRoles: ['client_admin'] as typeof rule.notifyRoles }
    const recipientIds = propertyDeskStakeholderIds(users, property)
    const filtered = applySuiteAlertFilter(users, recipientIds, restrictedRule, 'ag-1')
    expect(filtered.map((u) => u.id)).toEqual(['admin-1'])
  })

  it('excludeActorFromIds removes actor when includeActor is false', () => {
    expect(excludeActorFromIds(['agent-a', 'admin-1'], 'agent-a', false)).toEqual(['admin-1'])
    expect(excludeActorFromIds(['agent-a', 'admin-1'], 'agent-a', true)).toEqual([
      'agent-a',
      'admin-1',
    ])
  })

  it('applicationStakeholderIds uses application and property agents', () => {
    const app: Application = {
      id: 'APP-1',
      agencyId: 'ag-1',
      propertyId: property.id,
      agentId: 'agent-b',
      applicantUserId: 'tenant-1',
      applicantName: 'Sam',
      email: 'sam@test.co.za',
      phone: '082',
      type: 'Rent',
      workflowStatus: 'application_submitted',
      stage: 'Submitted',
      progress: 10,
      income: 30000,
      employment: 'Employed',
      creditCheck: 'Not Started',
      creditConsent: false,
      documents: [],
      docs: [],
      viewingSlotId: null,
      notes: '',
      submittedAt: '2026-01-01',
      updatedAt: '2026-01-01',
    }
    const ids = applicationStakeholderIds(users, app, property)
    expect(ids).toEqual(expect.arrayContaining(['agent-b', 'agent-a', 'admin-1']))
    expect(uniqueIds(ids)).toHaveLength(ids.length)
  })

  it('agencyAdminIds returns principal and agent admin roles only', () => {
    const roster: AppUser[] = [
      ...users,
      {
        id: 'ops-admin',
        name: 'Ops Admin',
        email: 'ops@test.co.za',
        role: 'agent_admin',
        agencyId: 'ag-1',
        active: true,
        enabledPermissions: [],
        licenseStatus: 'n/a',
      },
    ]
    expect(agencyAdminIds(roster, 'ag-1').sort()).toEqual(['admin-1', 'ops-admin'].sort())
  })
})
