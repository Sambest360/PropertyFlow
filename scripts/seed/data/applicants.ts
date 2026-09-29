import type { DbRole } from '../helpers.js'

export type ApplicantDef = {
  feId: string
  email: string
  firstName: string
  lastName: string
  phone: string
}

/** Applicant portal users — applications only; no viewing slot bookings or tenancies. */
export const APPLICANTS: ApplicantDef[] = [
  {
    feId: 'u-applicant-riaan',
    email: 'riaan.botha.propertyflow@example.test',
    firstName: 'Riaan',
    lastName: 'Botha',
    phone: '+27 83 221 4455',
  },
  {
    feId: 'u-applicant-elena',
    email: 'elena.costa.propertyflow@example.test',
    firstName: 'Elena',
    lastName: 'Costa',
    phone: '+27 72 555 8810',
  },
  {
    feId: 'u-applicant-sarie',
    email: 'sarie.duplessis.propertyflow@example.test',
    firstName: 'Sarie',
    lastName: 'du Plessis',
    phone: '+27 76 900 1122',
  },
  {
    feId: 'u-applicant-thabo',
    email: 'thabo.mokoena.propertyflow@example.test',
    firstName: 'Thabo',
    lastName: 'Mokoena',
    phone: '+27 81 440 2299',
  },
  {
    feId: 'u-applicant-amy',
    email: 'amy.visser.propertyflow@example.test',
    firstName: 'Amy',
    lastName: 'Visser',
    phone: '+27 73 880 5511',
  },
  {
    feId: 'u-applicant-jordan',
    email: 'jordan.pillay.propertyflow@example.test',
    firstName: 'Jordan',
    lastName: 'Pillay',
    phone: '+27 84 900 7788',
  },
]

/**
 * P0-5 (GO #5): QA guide personas need their seeded applications — Riaan = Submitted,
 * Elena = Under review, Sarie = Approved (purchase, tenant tools unlocked).
 * The remaining applicants stay empty so fresh-register-through-marketplace is testable.
 */
export const APPLICATION_DEFS: Array<{
  applicantFeId: string
  propertyFeId: string
  ref: string
  status: 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED'
  type: 'RENTAL' | 'PURCHASE'
}> = [
  { applicantFeId: 'u-applicant-riaan', propertyFeId: 'PR-SCB-006', ref: 'APP-SCB-901', status: 'SUBMITTED', type: 'RENTAL' },
  { applicantFeId: 'u-applicant-elena', propertyFeId: 'PR-SCB-007', ref: 'APP-SCB-902', status: 'UNDER_REVIEW', type: 'RENTAL' },
  { applicantFeId: 'u-applicant-sarie', propertyFeId: 'PR-SCB-008', ref: 'APP-SCB-903', status: 'APPROVED', type: 'PURCHASE' },
]

export const APPLICANT_DB_ROLE: DbRole = 'END_USER'
