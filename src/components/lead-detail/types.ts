export type LeadDetailTab = 'overview' | 'details' | 'activity' | 'history'

export const LEAD_DETAIL_TABS: LeadDetailTab[] = [
  'overview',
  'details',
  'activity',
  'history',
]

export function isLeadDetailTab(v: string | null): v is LeadDetailTab {
  return Boolean(v && (LEAD_DETAIL_TABS as string[]).includes(v))
}

export const LEAD_STAGES = [
  'New Lead',
  'Contacted',
  'Viewing Scheduled',
  'Viewing Completed',
  'Application Submitted',
  'Offer Sent',
  'Deposit Paid',
  'Lease Signed',
  'Sale Completed',
] as const

export const ICON_STROKE = 1.6
