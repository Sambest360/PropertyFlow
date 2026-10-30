import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * T3 (spec r4) wiring in the listing page and the store. The rules live in
 * listingEnquiryOutcome.ts / clientLeadPersist.ts / listingEnquiryApi.ts (tested
 * there); this pins that the page and the store use them. Source-scan style as
 * PropertyCreatePage.t2.test.ts: vitest runs in node here (no DOM), so the
 * click-through is a manual / browser check listed in the PR.
 */
const page = readFileSync('src/pages/market/ListingDetail.tsx', 'utf8')
const submitEnquiry = page.slice(
  page.indexOf('const submitEnquiry = async'),
  page.indexOf('const submitApplication = async'),
)
const submitApplication = page.slice(
  page.indexOf('const submitApplication = async'),
  page.indexOf('const applyHref'),
)
const store = readFileSync('src/context/AppStore.tsx', 'utf8')
const recordGuest = store.slice(
  store.indexOf('recordGuestEnquiry: (input) => {'),
  store.indexOf('updateLeadStage: (id, stage) => {'),
)

describe('T3: Register interest wiring', () => {
  it('the store records a server-saved enquiry locally only: no persist call', () => {
    expect(recordGuest.length).toBeGreaterThan(100)
    expect(recordGuest).not.toMatch(/persistUpsert|persistToApi|queueUpsert/)
  })

  it('the page keeps the sheet open and shows the outcome inline (no success modal)', () => {
    expect(submitEnquiry).not.toContain('setEnquirySheetOpen(false)')
    expect(submitEnquiry).not.toMatch(/sweetSuccess|sweetInfo|sweetError\('Could not save enquiry'/)
    expect(submitEnquiry).toContain('setEnquiryOutcome(enquiryOutcome(result,')
    expect(page).toContain('<EnquiryConfirmation outcome={enquiryOutcome_}')
  })

  it('a duplicate or failed enquiry is not added to local state', () => {
    expect(submitEnquiry).toMatch(/if \(shouldRecordEnquiryLocally\(result\)\) \{\s*recordGuestEnquiry\(/)
  })

  it('apply: a guest / tenant (portal) applicant does not persist the lead (no 403)', () => {
    expect(submitApplication).toMatch(/createLead\(\{[\s\S]*persist: clientMayPersistLead\(user\.role\)/)
  })
})
