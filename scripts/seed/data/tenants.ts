import type { DbRole } from '../helpers.js'

export type TenantDef = {
  feId: string
  email: string
  firstName: string
  lastName: string
  phone: string
}

export const TENANTS: TenantDef[] = [
  { feId: 'u-tenant-lucas', email: 'lucas.pretorius@propertyflow.demo', firstName: 'Lucas', lastName: 'Pretorius', phone: '+27 82 500 2001' },
  { feId: 'u-tenant-nomsa', email: 'nomsa.dlamini@propertyflow.demo', firstName: 'Nomsa', lastName: 'Dlamini', phone: '+27 71 883 1102' },
  { feId: 'u-tenant-fatima', email: 'fatima.jacobs@propertyflow.demo', firstName: 'Fatima', lastName: 'Jacobs', phone: '+27 84 112 7788' },
  { feId: 'u-tenant-aya', email: 'aya.daniels@propertyflow.demo', firstName: 'Aya', lastName: 'Daniels', phone: '+27 72 880 1100' },
  { feId: 'u-tenant-mia', email: 'mia.fortuin@propertyflow.demo', firstName: 'Mia', lastName: 'Fortuin', phone: '+27 82 700 3344' },
  { feId: 'u-tenant-riaan', email: 'riaan.botha@propertyflow.demo', firstName: 'Riaan', lastName: 'Botha', phone: '+27 83 221 4455' },
  { feId: 'u-tenant-elena', email: 'elena.costa@propertyflow.demo', firstName: 'Elena', lastName: 'Costa', phone: '+27 72 555 8810' },
  { feId: 'u-tenant-sarie', email: 'sarie.duplessis@propertyflow.demo', firstName: 'Sarie', lastName: 'du Plessis', phone: '+27 76 900 1122' },
]

export const LEASE_ASSIGNMENTS: Array<{ tenantFeId: string; propertyFeId: string; ref: string }> = [
  { tenantFeId: 'u-tenant-lucas', propertyFeId: 'PR-SCB-001', ref: 'SCB-LS-001' },
  { tenantFeId: 'u-tenant-nomsa', propertyFeId: 'PR-SCB-002', ref: 'SCB-LS-002' },
  { tenantFeId: 'u-tenant-fatima', propertyFeId: 'PR-SCB-003', ref: 'SCB-LS-003' },
  { tenantFeId: 'u-tenant-aya', propertyFeId: 'PR-SCB-004', ref: 'SCB-LS-004' },
  { tenantFeId: 'u-tenant-mia', propertyFeId: 'PR-SCB-005', ref: 'SCB-LS-005' },
]

export const APPLICATION_DEFS: Array<{
  tenantFeId: string
  propertyFeId: string
  ref: string
  status: 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED'
  type: 'RENTAL' | 'PURCHASE'
}> = [
  { tenantFeId: 'u-tenant-riaan', propertyFeId: 'PR-SCB-006', ref: 'APP-SCB-901', status: 'SUBMITTED', type: 'RENTAL' },
  { tenantFeId: 'u-tenant-elena', propertyFeId: 'PR-SCB-007', ref: 'APP-SCB-902', status: 'UNDER_REVIEW', type: 'RENTAL' },
  { tenantFeId: 'u-tenant-sarie', propertyFeId: 'PR-SCB-008', ref: 'APP-SCB-903', status: 'APPROVED', type: 'PURCHASE' },
]

export const TENANT_DB_ROLE: DbRole = 'END_USER'
