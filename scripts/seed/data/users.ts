import type { DbRole } from '../helpers.js'

export type StaffUserDef = {
  feId: string
  email: string
  firstName: string
  lastName: string
  phone: string
  dbRole: DbRole
  licenseStatus?: string
  commissionSharePct?: number
}

export const AGENCY_ADMIN: StaffUserDef = {
  feId: 'u-admin-lerato',
  email: 'lerato.nkosi@propertyflow.demo',
  firstName: 'Lerato',
  lastName: 'Nkosi',
  phone: '+27 82 400 1001',
  dbRole: 'AGENT_ADMIN',
}

export const AGENTS: StaffUserDef[] = [
  {
    feId: 'u-agent-james',
    email: 'james.okonkwo@propertyflow.demo',
    firstName: 'James',
    lastName: 'Okonkwo',
    phone: '+27 82 400 1002',
    dbRole: 'GROUND_AGENT',
    licenseStatus: 'full',
    commissionSharePct: 70,
  },
  {
    feId: 'u-agent-priya',
    email: 'priya.naidoo@propertyflow.demo',
    firstName: 'Priya',
    lastName: 'Naidoo',
    phone: '+27 82 400 1003',
    dbRole: 'GROUND_AGENT',
    licenseStatus: 'full',
    commissionSharePct: 65,
  },
  {
    feId: 'u-agent-themba',
    email: 'themba.maseko@propertyflow.demo',
    firstName: 'Themba',
    lastName: 'Maseko',
    phone: '+27 82 400 1004',
    dbRole: 'GROUND_AGENT',
    licenseStatus: 'full',
    commissionSharePct: 60,
  },
  {
    feId: 'u-agent-nadia',
    email: 'nadia.vanwyk@propertyflow.demo',
    firstName: 'Nadia',
    lastName: 'van Wyk',
    phone: '+27 82 400 1005',
    dbRole: 'GROUND_AGENT',
    licenseStatus: 'full',
    commissionSharePct: 68,
  },
  {
    feId: 'u-agent-chris',
    email: 'chris.daniels@propertyflow.demo',
    firstName: 'Chris',
    lastName: 'Daniels',
    phone: '+27 82 400 1006',
    dbRole: 'GROUND_AGENT',
    licenseStatus: 'candidate',
    commissionSharePct: 50,
  },
]

/** Property count per agent (James, Priya, Themba, Nadia, Chris) */
export const AGENT_PROPERTY_COUNTS = [1, 2, 4, 6, 3] as const
