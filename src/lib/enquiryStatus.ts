import type { Lead } from '../types/domain'

export type EnquiryStatus = {
  label: string
  tone: 'brand' | 'success' | 'warning' | 'danger' | 'neutral'
  open: boolean
  /** What the tenant can do next from the listing. */
  next: 'viewing' | 'apply' | null
}

/**
 * The agency's lead stage, said to the person who sent the enquiry.
 * Unknown (agency-added) stages read as "With the agent".
 */
export function enquiryStatus(lead: Pick<Lead, 'stage'>): EnquiryStatus {
  const s = (lead.stage || '').toLowerCase()
  if (/reject|lost|closed|declin|cancel/.test(s)) return { label: 'Closed', tone: 'danger', open: false, next: null }
  if (/sale completed|lease signed|deposit paid|won/.test(s)) return { label: 'Completed', tone: 'success', open: false, next: null }
  if (/application|offer|credit/.test(s)) return { label: 'Application in progress', tone: 'brand', open: true, next: null }
  if (/viewing completed/.test(s)) return { label: 'Viewed', tone: 'brand', open: true, next: 'apply' }
  if (/viewing/.test(s)) return { label: 'Viewing booked', tone: 'brand', open: true, next: null }
  if (/contact/.test(s)) return { label: 'Agent contacted you', tone: 'warning', open: true, next: 'viewing' }
  if (/new/.test(s) || !s) return { label: 'Sent', tone: 'neutral', open: true, next: 'viewing' }
  return { label: 'With the agent', tone: 'warning', open: true, next: 'viewing' }
}
