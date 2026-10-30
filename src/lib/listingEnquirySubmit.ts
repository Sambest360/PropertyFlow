import type { ListingEnquiryResult } from './api/listingEnquiryApi'
import { clientMayCreateLead } from './clientLeadPersist'
import { enquiryOutcome, shouldRecordEnquiryLocally, type EnquiryOutcome } from './listingEnquiryOutcome'

/**
 * T3 F3 (Angela): what the listing page does with a Register-interest result,
 * as a pure plan (unit-tested in listingEnquirySubmit.test.ts). The page only
 * executes it: record locally if `record`, show `outcome`, clear the note if
 * `clearNote`.
 */
export type EnquiryListing = {
  id: string
  agencyId: string
  agentId: string | null
  listingMode?: string
  value: number
}

export type EnquiryContact = { name: string; email: string; phone: string; notes: string }

export type EnquirySubmitContext = {
  listing: EnquiryListing
  contact: EnquiryContact
  action: 'lead' | 'viewing'
  slot: { id: string; date: string; time: string } | null
  agentName?: string | null
}

export type EnquiryRecord = {
  lead: {
    id: string
    agencyId: string
    propertyId: string
    agentId: string | null
    name: string
    email: string
    phone: string
    channel: 'Web Form'
    type: 'Rent' | 'Buy'
    value: number
    stage: string
    notes: string
  }
  viewing: {
    id?: string
    agencyId: string
    propertyId: string
    agentId: string | null
    slotId: string
    applicantName: string
    applicantEmail: string
    date: string
    time: string
  } | null
}

export type EnquirySubmitPlan = {
  /** The server-saved lead (and booking) to mirror locally; null when nothing new was saved. */
  record: EnquiryRecord | null
  outcome: EnquiryOutcome
  clearNote: boolean
}

const leadType = (listing: EnquiryListing): 'Rent' | 'Buy' => (listing.listingMode === 'sale' ? 'Buy' : 'Rent')

export function enquirySubmitPlan(result: ListingEnquiryResult, ctx: EnquirySubmitContext): EnquirySubmitPlan {
  const { listing, contact } = ctx
  let record: EnquiryRecord | null = null
  if (shouldRecordEnquiryLocally(result)) {
    record = {
      lead: {
        id: result.leadId,
        agencyId: listing.agencyId,
        propertyId: listing.id,
        agentId: listing.agentId,
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
        channel: 'Web Form',
        type: leadType(listing),
        value: listing.value,
        stage: result.stage,
        notes: contact.notes,
      },
      viewing:
        ctx.action === 'viewing' && ctx.slot
          ? {
              id: result.bookingId ?? undefined,
              agencyId: listing.agencyId,
              propertyId: listing.id,
              agentId: listing.agentId,
              slotId: ctx.slot.id,
              applicantName: contact.name,
              applicantEmail: contact.email,
              date: ctx.slot.date,
              time: ctx.slot.time,
            }
          : null,
    }
  }
  const outcome = enquiryOutcome(result, {
    action: ctx.action,
    slot: ctx.slot ? { date: ctx.slot.date, time: ctx.slot.time } : null,
    agentName: ctx.agentName ?? null,
  })
  const clearNote = result.ok === true || result.waitlist === true
  return { record, outcome, clearNote }
}

/**
 * T3 B1 (Angela): the apply path's lead. It is a NEW lead (no id: the store
 * mints a fresh LD-…), so a tenant's is saved to the server as at base; a
 * guest's, landlord's or contractor's stays local because the server refuses
 * it (see clientLeadPersist.ts).
 */
export function applyLeadInput(args: { listing: EnquiryListing; contact: EnquiryContact; role: string | null | undefined }) {
  const { listing, contact } = args
  return {
    agencyId: listing.agencyId,
    propertyId: listing.id,
    agentId: listing.agentId,
    name: contact.name,
    email: contact.email,
    phone: contact.phone,
    channel: 'Web Form' as const,
    type: leadType(listing),
    value: listing.value,
    stage: 'Application Submitted',
    notes: contact.notes,
    persist: clientMayCreateLead(args.role),
  }
}
