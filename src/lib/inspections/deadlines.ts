/**
 * Day counts shown beside a deposit comparison.
 * These follow a common reading of Rental Housing Act s5 and need a lawyer
 * to confirm before anyone treats them as legal advice. This product is not
 * an RHA-certified inspection.
 */
export const INSPECTION_DEADLINES = {
  lawyerConfirmationRequired: true,
  noDeductionsRefundDays: 7,
  deductionsBalanceDays: 14,
  tenantAbsentInspectDays: 7,
  tenantAbsentRefundDays: 21,
} as const

export const INSPECTION_DEADLINE_NOTE =
  'Day counts need a lawyer to confirm. They are not legal advice and this inspection is not an RHA-certified product. No deductions: refund within 7 days of lease end. Deductions: balance within 14 days of restoration, with receipts. Tenant absent: landlord inspects within 7 days and refunds within 21 days.'
