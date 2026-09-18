/**
 * Application process API — mirrors POST /api/v1/applications
 * Demo store implements the same guards as the backend pseudocode.
 */

import type { Unit, UnitListingType, UnitStatusKey } from '../data/infrastructure'
import type { Application, PropertyAsset } from '../types/domain'

export type ApplicationTypeApi = 'RENT' | 'PURCHASE'

export type UploadedDocsPayload = {
  bank_statements_url?: string
  id_copy_url?: string
  payslip_url?: string
}

export type SubmitApplicationRequest = {
  unit_id: string
  application_type: ApplicationTypeApi
  monthly_income_declared: number
  id_number_or_passport: string
  uploaded_docs: UploadedDocsPayload
  /** Demo extras for UI */
  applicant_name?: string
  email?: string
  phone?: string
  applicant_user_id?: string | null
}

export type SubmitApplicationSuccess = {
  status: 'SUCCESS'
  application_id: string
  message: string
  httpStatus: 201
}

export type SubmitApplicationError = {
  status: 'ERROR'
  error: string
  httpStatus: 400 | 401 | 404 | 409 | 422
}

export type SubmitApplicationResult = SubmitApplicationSuccess | SubmitApplicationError

const INCOME_MULTIPLIER = 3

export function resolveUnitForProperty(
  property: PropertyAsset | undefined,
  units: Unit[],
): Unit | undefined {
  if (!property) return undefined
  if (property.unitId) return units.find((u) => u.id === property.unitId)
  return undefined
}

export function isUnitAcceptingApplications(unit: {
  listingType: UnitListingType
  statusKey: UnitStatusKey
}): boolean {
  if (unit.listingType === 'not_listed') return false
  if (unit.statusKey === 'OCCUPIED') return false
  return true
}

/** Gross income must be at least 3× monthly rent (SA rule of thumb). */
export function meetsIncomeRequirement(
  applicationType: ApplicationTypeApi | 'Rental' | 'Purchase',
  monthlyIncome: number,
  monthlyRent: number | null | undefined,
): boolean {
  const isRent = applicationType === 'RENT' || applicationType === 'Rental'
  if (!isRent) return true
  const rent = monthlyRent ?? 0
  if (rent <= 0) return true
  return monthlyIncome >= rent * INCOME_MULTIPLIER
}

export function minimumRequiredIncome(monthlyRent: number): number {
  return monthlyRent * INCOME_MULTIPLIER
}

/**
 * Pure validation matching the API endpoint guards.
 * Caller persists the application row after SUCCESS path.
 */
export function validateApplicationSubmission(params: {
  unit: Unit | undefined
  property?: PropertyAsset
  request: SubmitApplicationRequest
}): SubmitApplicationResult | { status: 'OK'; rentOrPrice: number } {
  const { unit, property, request } = params

  if (!unit && !property) {
    return { status: 'ERROR', error: 'Property unit not found', httpStatus: 404 }
  }

  const isRent = request.application_type === 'RENT'
  const rent = unit?.rent ?? property?.rent ?? 0

  return {
    status: 'OK',
    rentOrPrice: isRent ? rent : (unit?.price ?? property?.price ?? 0),
  }
}

export function toDomainApplicationType(t: ApplicationTypeApi): Application['type'] {
  return t === 'RENT' ? 'Rental' : 'Purchase'
}

export function fromDomainApplicationType(t: Application['type']): ApplicationTypeApi {
  return t === 'Rental' ? 'RENT' : 'PURCHASE'
}
