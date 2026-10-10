/**
 * Priorities a tenant may give their own ticket (maintenance or complaint).
 * The server accepts only these (anything else is a 400
 * TICKET_PRIORITY_INVALID); Urgent is a staff triage level.
 */
export const TENANT_TICKET_PRIORITIES = ['Low', 'Medium', 'High', 'Emergency'] as const
export type TenantTicketPriority = (typeof TENANT_TICKET_PRIORITIES)[number]

/** Complaint severity (tenant complaints form) -> ticket priority. Urgent escalates as Emergency. */
export const COMPLAINT_SEVERITY_TO_PRIORITY = {
  Low: 'Low',
  Medium: 'Medium',
  High: 'High',
  Urgent: 'Emergency',
} as const satisfies Record<string, TenantTicketPriority>
export type ComplaintSeverity = keyof typeof COMPLAINT_SEVERITY_TO_PRIORITY

/** 'Emergency' / 'EMERGENCY' / ' emergency ' -> 'Emergency'; null when not on the list. */
export function normalizeTenantTicketPriority(value: unknown): TenantTicketPriority | null {
  if (typeof value !== 'string') return null
  const v = value.trim().toLowerCase()
  return TENANT_TICKET_PRIORITIES.find((p) => p.toLowerCase() === v) ?? null
}

/** API form (LOW / MEDIUM / HIGH / EMERGENCY) for createMaintenanceTicket requests. */
export function tenantPriorityToApi(p: TenantTicketPriority): 'LOW' | 'MEDIUM' | 'HIGH' | 'EMERGENCY' {
  return p.toUpperCase() as 'LOW' | 'MEDIUM' | 'HIGH' | 'EMERGENCY'
}
