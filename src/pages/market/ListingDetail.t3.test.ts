import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/**
 * T3 wiring in the listing page and the store: SOURCE SCANS, not behaviour.
 * vitest runs in node here (no DOM, no testing-library), so these pin the
 * code text. The behaviour lives in pure modules tested elsewhere:
 * listingEnquirySubmit.ts (what a result does), listingEnquiryOutcome.ts,
 * clientLeadPersist.ts, listingEnquiryApi.ts, and the store's network calls
 * in AppStore.t3.persist.test.tsx. The click-through is the post-deploy
 * browser check (Jim C2).
 *
 * F3 (Angela): every scan runs on the code with comments removed (TypeScript
 * parser + printer), so a commented-out line no longer satisfies a match, and
 * the scans forbid the shapes her surviving mutants used (an updater that
 * closes the sheet, a raw fetch, a bootstrap refresh, a constant-guarded
 * confirmation, a second outcome write, a duplicate recorded locally).
 */
function codeOf(path: string): string {
  const src = readFileSync(path, 'utf8')
  const sf = ts.createSourceFile(path, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const printed = ts.createPrinter({ removeComments: true }).printFile(sf)
  return printed.replace(/\s+/g, ' ')
}
function between(code: string, start: string, end: string): string {
  const a = code.indexOf(start)
  const b = code.indexOf(end, a + 1)
  if (a < 0 || b < 0) throw new Error(`slice not found: ${start} … ${end}`)
  return code.slice(a, b)
}
const count = (s: string, needle: string) => s.split(needle).length - 1

const page = codeOf('src/pages/market/ListingDetail.tsx')
const submitEnquiry = between(page, 'const submitEnquiry = async', 'const submitApplication = async')
const afterSubmit = submitEnquiry.slice(submitEnquiry.indexOf('await submitListingEnquiry('))
const beforeSubmit = submitEnquiry.slice(0, submitEnquiry.indexOf('await submitListingEnquiry('))
const submitApplication = between(page, 'const submitApplication = async', 'const applyHref')
const store = codeOf('src/context/AppStore.tsx')
const recordGuest = between(store, 'recordGuestEnquiry: (input) => {', 'updateLeadStage: (id, stage) => {')

describe('T3: Register interest wiring (source scans, comments removed)', () => {
  it('the comment stripper really strips comments', () => {
    expect(page).not.toMatch(/\/\/ T3/)
    expect(submitEnquiry.length).toBeGreaterThan(200)
    expect(afterSubmit.length).toBeGreaterThan(50)
  })

  it('the store records a server-saved enquiry locally only: no persist, fetch or bootstrap refresh (M01, M02)', () => {
    expect(recordGuest.length).toBeGreaterThan(100)
    expect(recordGuest).not.toMatch(
      /persistUpsert|persistToApi|queueUpsert|persistVia|scheduleBootstrapRefresh|refreshSessionData|\bfetch\s*\(|createLead\s*\(/,
    )
  })

  it('submitEnquiry never touches the sheet and opens no modal once the server answered (M04, M22)', () => {
    expect(submitEnquiry).not.toContain('setEnquirySheetOpen')
    expect(afterSubmit).not.toMatch(/\bsweet[A-Z]\w*\s*\(/)
  })

  it('the outcome is reset once before the call and written once after it, from the plan (M03, M06, M08)', () => {
    expect(count(beforeSubmit, 'setEnquiryOutcome(null)')).toBe(1)
    expect(count(afterSubmit, 'setEnquiryOutcome(')).toBe(1)
    expect(afterSubmit).toContain('setEnquiryOutcome(plan.outcome)')
  })

  it('the result is handled only through enquirySubmitPlan; only plan.record is recorded (M07)', () => {
    expect(afterSubmit).toMatch(/const plan = enquirySubmitPlan\(result, /)
    expect(count(submitEnquiry, 'recordGuestEnquiry(')).toBe(1)
    expect(afterSubmit).toMatch(/if \(plan\.record\) ?\{? ?recordGuestEnquiry\(plan\.record\)/)
    expect(afterSubmit).toMatch(/if \(plan\.clearNote\) ?\{? ?setNote\(''\)/)
  })

  it('the confirmation is rendered unconditionally from the outcome state (M05)', () => {
    expect(count(page, '<EnquiryConfirmation ')).toBe(1)
    expect(page).toMatch(/<EnquiryConfirmation outcome=\{enquiryOutcome_\} ?\/>/)
    // Not behind a guard: the component itself returns null with no outcome.
    expect(page).not.toMatch(/(&&|\?|\|\|)\s*\(?\s*<EnquiryConfirmation/)
  })

  it('apply: the lead comes from applyLeadInput (role-gated persist), with no override (M09, M10)', () => {
    expect(count(submitApplication, 'createLead(')).toBe(1)
    expect(submitApplication).toMatch(/createLead\(applyLeadInput\(\{ listing: enquiryListing, contact: enquiryContact, role: user\.role \}\)\)/)
    expect(submitApplication).not.toMatch(/persist\s*:/)
  })
})
