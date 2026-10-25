import { describe, expect, it } from 'vitest'
import { enquiryStatus } from './enquiryStatus'

describe('enquiryStatus', () => {
  it('says the agency stage in the enquirer’s words, with the next step', () => {
    expect(enquiryStatus({ stage: 'New Lead' })).toMatchObject({ label: 'Sent', open: true, next: 'viewing' })
    expect(enquiryStatus({ stage: 'Contacted' })).toMatchObject({ label: 'Agent contacted you', next: 'viewing' })
    expect(enquiryStatus({ stage: 'Viewing Scheduled' })).toMatchObject({ label: 'Viewing booked', next: null })
    expect(enquiryStatus({ stage: 'Viewing Completed' })).toMatchObject({ label: 'Viewed', next: 'apply' })
    expect(enquiryStatus({ stage: 'Rejected' })).toMatchObject({ label: 'Closed', open: false })
    expect(enquiryStatus({ stage: 'Lease Signed' })).toMatchObject({ label: 'Completed', open: false })
    expect(enquiryStatus({ stage: 'Waiting on bank' })).toMatchObject({ label: 'With the agent', open: true })
  })
})
