export type Role =
  | 'super_admin'
  | 'client_admin'
  | 'agent_admin'
  | 'ground_agent'
  /** Candidate / intern agent (also used for older demo rows previously labeled “agent”). */
  | 'agent'
  | 'landlord'
  | 'tenant'
  | 'contractor'

export type LicenseStatus = 'principal' | 'full' | 'candidate' | 'n/a'

export type Permission =
  | 'platform.manage'
  | 'tenant.manage'
  | 'users.manage'
  | 'roles.assign'
  | 'users.impersonate'
  | 'config.manage'
  | 'notifications.broadcast'
  | 'assets.view'
  | 'assets.manage'
  | 'listings.publish'
  | 'leads.view'
  | 'leads.manage'
  | 'applications.view'
  | 'applications.review'
  | 'viewings.manage'
  | 'maintenance.view'
  | 'maintenance.manage'
  | 'contractors.view'
  | 'contractors.manage'
  | 'documents.view'
  | 'payments.view'
  | 'payments.manage'
  | 'reports.view'
  | 'messages.manage'
  | 'occupants.view'
  | 'portal.owner'
  | 'portal.tenant'
  | 'portal.contractor'
  // Compliance permissions
  | 'compliance.view'
  // Trust / Banking permissions
  | 'trust.view'
  | 'trust.allocate'
  | 'trust.approve_payout'
  | 'trust.import_csv'
  | 'trust.view_arrears'
  | 'trust.view_own_statement'
  | 'trust.view_own_invoices'

/** End-to-end application → move-in lifecycle */
export type ApplicationStage =
  | 'Started'
  | 'Documents Pending'
  | 'Documents Submitted'
  | 'Viewing Booked'
  | 'Under Review'
  | 'Credit Check'
  | 'Approved'
  | 'Awaiting Payment'
  | 'Deposit Paid'
  | 'Lease Signed'
  | 'Move-In Scheduled'
  | 'Keys Handed Over'
  | 'Active Tenancy'
  | 'Rejected'
  | 'Withdrawn'
  | 'Blocked'

export type DocStatus = 'required' | 'uploaded' | 'verified' | 'rejected'

export type ApplicationDocumentFile = {
  name: string
  mimeType: string
  dataUrl: string
  uploadedAt: string
  uploadedBy?: string | null
}

export type ApplicationDocument = {
  key: string
  label: string
  status: DocStatus
  note?: string
  file?: ApplicationDocumentFile
  rejectedReason?: string
  reviewedAt?: string
  reviewedBy?: string | null
}

export type ApplicationWorkflowEvent = {
  id: string
  applicationId: string
  stage: string
  actionKey?: string
  actorUserId?: string | null
  actorName?: string | null
  at: string
  summary: string
  payload?: Record<string, unknown>
}

export type Agency = {
  id: string
  name: string
  slug: string
  city: string
  status: 'Active' | 'Suspended' | 'Cancelled'
  createdAt: string
  /** Modules this agency’s staff may use (intersected with role permissions). */
  enabledPermissions: Permission[]
  tradingAs?: string
  email?: string
  phone?: string
  province?: string
  countryCode?: string
  timezone?: string
  settings?: {
    applicationJourney?: import('../lib/journey/types.js').AgencyJourneyOverride
    /** Blank caps are unlimited. Unit NULL inherits these. */
    listingLimits?: {
      maxEnquiries?: number | null
      maxViewings?: number | null
      limitAction?: 'CLOSE' | 'WAITLIST'
      showRemaining?: boolean
    }
    requireViewingToApply?: boolean
    buildingViewingCountsForAllUnits?: boolean
    mainApplicantViewingCoversCoApplicants?: boolean
  }
}

export type AppUser = {
  id: string
  name: string
  /** When set, persisted as separate columns — `name` remains the display label. */
  firstName?: string
  lastName?: string
  /** Absent on redacted bootstrap users (other people outside your admin scope). */
  email?: string
  role: Role
  agencyId: string | null
  phone?: string
  /** SA ID or passport — used for compliance identity. */
  idNumberOrPassport?: string
  /**
   * CR10: the user's own saved signature (PNG data URL, users.metadata.signature).
   * Bootstrap returns it for the session user only.
   */
  signature?: string | null
  /** ISO date YYYY-MM-DD — derived from SA ID when applicable, or entered manually. */
  dateOfBirth?: string
  /** Employer / brokerage / trading name when relevant. */
  company?: string
  active: boolean
  /** Session-only: true when users.metadata.mustChangePassword is set (temp password). */
  mustChangePassword?: boolean
  avatar?: string
  /**
   * When set, replaces the role’s default permission pack for this user
   * (still intersected with the agency’s enabledPermissions).
   */
  enabledPermissions?: Permission[]
  /** Candidate / intern agents train under a principal or full agent. */
  mentorId?: string | null
  /** Licensing posture for compliance tracking. */
  licenseStatus?: LicenseStatus
  /** Share of fee retained by the agent (rest to the agency). */
  commissionSharePct?: number
  /**
   * Landlord / contractor onboarding review.
   * Omitted or missing on seeded users ⇒ treated as approved.
   */
  verification?: {
    status: 'pending' | 'approved' | 'rejected' | 'not_required'
    submittedAt?: string
    reviewedAt?: string
    reviewedBy?: string | null
    rejectNote?: string
    profile?: Record<string, unknown>
    documents?: Array<{
      key: string
      label: string
      name: string
      mimeType: string
      dataUrl: string
      uploadedAt: string
      lookedAt?: string
    }>
  }
}

export type Room = {
  id: string
  name: string
  beds: number
  baths: number
  area?: number
  kind?: string
  layout?: { x: number; y: number; w: number; h: number }
}

export type InternalAssetItem = {
  id: string
  roomId: string | null
  itemName: string
  serialNumber?: string
  assetTypeKey: string
  condition: string
  brand?: string
}

export type PropertyAsset = {
  id: string
  /** Postgres units.id when hydrated from Supabase */
  backendId?: string
  /** Postgres units.updated_at (ISO) — last edit, used for "Recent activity" order. */
  updatedAt?: string | null
  agencyId: string
  landlordId: string
  agentId: string | null
  /** Public marketplace only: the listing agent's display name (no user id). */
  agentName?: string | null
  /** Links flat listing → infrastructure unit when present */
  buildingId?: string | null
  unitId?: string | null
  title: string
  type: string
  status: 'Draft' | 'Published' | 'Featured' | 'Under Offer' | 'Sold' | 'Rented' | 'Archived' | 'Maintenance'
  advertiseWhileOccupied?: boolean
  availableFrom?: string | null
  listingMode: 'sale' | 'rent' | 'both'
  /** Public marketplace: listing hit its enquiry or viewing cap. */
  fullyBooked?: boolean
  viewingsFull?: boolean
  enquiriesFull?: boolean
  limitAction?: 'CLOSE' | 'WAITLIST'
  showRemaining?: boolean
  remainingViewings?: number | null
  remainingEnquiries?: number | null
  price: number | null
  rent: number | null
  beds: number
  baths: number
  parking: number
  /** Enclosed garage bays (from garage rooms) */
  garages?: number
  area: number
  city: string
  suburb: string
  address: string
  lat: number
  lng: number
  /** Google Places place_id when geocoded */
  placeId?: string | null
  /** Canonical address from geocoder */
  formattedAddress?: string | null
  /** ISO timestamp of last successful geocode */
  geocodedAt?: string | null
  images: string[]
  floorPlan?: string
  rooms: Room[]
  /** In-unit inventory (microwave, beds, etc.) */
  internalAssets?: InternalAssetItem[]
  amenities: string[]
  description: string
  featured: boolean
  createdAt: string
  /** Soft-delete timestamp — removed from active portfolio but kept in archive. */
  deletedAt?: string | null
  /** Green infrastructure (SA-relevant) */
  solarCapacityKw?: number
  hasBorehole?: boolean
  grading?: string | null
  /**
   * Soft Mode A syndication: staff-flagged mandate active for soft-warn only.
   * Not a full mandate engine — incomplete → soft warning, not hard block.
   */
  mandateActive?: boolean | null
  /** Manual portal publication records (export pack / live_manual). */
  syndicationPublications?: ListingPublicationRecord[]
  /** Unit-level override; null inherits agency setting. */
  requireViewingToApply?: boolean | null
}

/** Soft Mode A portal publication row (mirrors src/lib/syndication types). */
export type ListingPublicationRecord = {
  id: string
  propertyId: string
  unitId?: string | null
  portalCode: 'propertyflow_marketplace' | 'property24' | 'private_property' | 'other'
  status: 'draft' | 'ready' | 'exported_manual' | 'live_manual' | 'error' | 'unpublished'
  externalListingId?: string | null
  liveUrl?: string | null
  lastError?: string | null
  lastPayloadHash?: string | null
  exportedAt?: string | null
  liveManualAt?: string | null
  unpublishedAt?: string | null
}

/** One configured requirement on a lead-pipeline step. */
export type LeadStageRequirement = {
  id: string
  kind: 'note' | 'document' | 'payment' | 'check'
  label: string
  description?: string
  /** Document requirements: DOC_TYPE lookup key or free-text description. */
  docType?: string
  required: boolean
}

/** Agent-completed state for one requirement on one lead. */
export type LeadRequirementCompletion = {
  done: boolean
  note?: string
  file?: ApplicationDocumentFile
  amount?: number
  reference?: string
  at?: string
  by?: string | null
}

/** Per-stage progress for a lead, keyed by stage keyValue then requirement id. */
export type LeadStageProgress = Record<string, LeadRequirementCompletion>

export type LeadMetadata = {
  stageProgress?: Record<string, LeadStageProgress>
}

export type Lead = {
  id: string
  agencyId: string
  propertyId: string
  agentId: string | null
  name: string
  email: string
  phone: string
  channel: string
  /**
   * Portal / syndication source code (property24, private_property, marketplace, …).
   * Mode A lead CSV sets this beside channel for CRM filters + dedupe.
   */
  source?: string
  /** Partner / CSV external lead id — primary dedupe key for portal imports. */
  externalId?: string | null
  stage: string
  type: 'Buy' | 'Rent'
  value: number
  notes: string
  createdAt: string
  updatedAt: string
  /** Client-managed extras — pipeline step requirement progress lives here. */
  metadata?: LeadMetadata
}

export type ApplicationUploadedDocs = {
  bankStatementsUrl?: string
  idCopyUrl?: string
  payslipUrl?: string
}

export type Application = {
  id: string
  agencyId: string
  propertyId: string
  /** Linked infrastructure unit when applying via Asset OS */
  unitId?: string | null
  agentId: string | null
  applicantUserId: string | null
  applicantName: string
  email: string
  phone: string
  type: 'Purchase' | 'Rental'
  /** Machine-readable workflow position — see applicationWorkflow.ts */
  workflowStatus?: string
  /** Human-readable stage label (derived from workflow template) */
  stage: string
  progress: number
  income: number
  employment: string
  employerName?: string
  jobTitle?: string
  idNumberOrPassport?: string
  uploadedDocs?: ApplicationUploadedDocs
  /**
   * Legacy display label kept in sync with `screening.status`.
   * Prefer `screening` for structured async status.
   */
  creditCheck: 'Not Started' | 'Consent Received' | 'In Progress' | 'Passed' | 'Failed' | 'Pending'
  /** @deprecated prefer screeningConsent.granted — kept in sync by the screening pipeline. */
  creditConsent: boolean
  /** Per-adult NCA credit-check consent (Reg 18) — frozen roster + signatures. */
  creditCheckConsents?: {
    adults: Array<{
      name: string
      idNumber: string
      signatureText: string
      grantedAt: string
      method: 'applicant'
    }>
  }
  /** POPIA / NCA credit-check consent capture (who / when / method). */
  screeningConsent?: {
    granted: boolean
    grantedAt?: string
    grantedBy?: string | null
    method?: 'document' | 'checkbox' | 'portal' | 'staff'
    note?: string
  }
  /** Structured async screening result (pending → in_progress → passed|failed|manual_override). */
  screening?: {
    status: 'pending' | 'in_progress' | 'passed' | 'failed' | 'manual_override'
    provider?: string
    externalReference?: string | null
    score?: number | null
    band?: string | null
    summary?: string | null
    checkedAt?: string | null
    override?: {
      byUserId: string
      byName: string
      at: string
      reason: string
      previousStatus: 'pending' | 'in_progress' | 'passed' | 'failed' | 'manual_override'
      newStatus: 'pending' | 'in_progress' | 'passed' | 'failed' | 'manual_override'
    } | null
    overrideHistory?: Array<{
      byUserId: string
      byName: string
      at: string
      reason: string
      previousStatus: 'pending' | 'in_progress' | 'passed' | 'failed' | 'manual_override'
      newStatus: 'pending' | 'in_progress' | 'passed' | 'failed' | 'manual_override'
    }>
  }
  documents: ApplicationDocument[]
  /** @deprecated prefer documents[]; kept for display fallbacks */
  docs: string[]
  viewingSlotId: string | null
  /** Mandatory-viewing proof (completed booking or staff override). */
  viewingEvidence?: import('../lib/applyEligibility.js').ViewingEvidence | null
  notes: string
  /** Staff decline / reject reason surfaced to applicant comms. */
  declineReason?: string
  /** Frozen journey config at application create (Phase 2). */
  journeySnapshot?: import('../lib/journey/types.js').JourneySnapshot
  journeyVersion?: number
  /** Why this applicant was blocked from the property / showings */
  blockReason?: string | null
  blockedAt?: string | null
  moveInDate?: string
  keyCollection?: {
    location: string
    instructions: string
    contactName: string
    contactPhone: string
    emailSentAt?: string
  }
  submittedAt: string
  updatedAt: string
  /** Audit trail for workflow transitions and document actions */
  workflowEvents?: ApplicationWorkflowEvent[]
  /**
   * Mode A soft-demo purchase closing checklist (staff-recorded ticks + optional notes).
   * Not live attorney / Deeds Office / bank bond partner status.
   */
  purchaseClosing?: {
    ticks: Partial<Record<string, boolean>>
    attorneyFirmNote?: string
    lodgementReferenceNote?: string
    updatedAt?: string
  }
  /**
   * Mode A soft PCR / inspections beside occupancy (incoming + outgoing).
   * Not PropertyInspect parity / not RHA legal advice / not a full field PCR product.
   */
  pcrInspections?: PropertyConditionInspectionRecord[]
}

/** Soft Mode A PCR inspection row (mirrors src/lib/pcr types). */
export type PropertyConditionInspectionRecord = {
  id: string
  agencyId: string
  applicationId: string
  propertyId: string
  tenancyId?: string | null
  unitId?: string | null
  kind: 'incoming' | 'outgoing'
  status: 'draft' | 'scheduled' | 'in_progress' | 'completed' | 'signed' | 'no_show_override'
  scheduledOn?: string | null
  completedAt?: string | null
  rooms: Array<{
    id: string
    name: string
    notes: string
    items: Array<{
      id: string
      label: string
      condition: 'excellent' | 'good' | 'fair' | 'poor' | 'damaged' | 'missing' | 'not_checked'
      notes: string
      photos: Array<{ id: string; url: string; caption?: string; capturedAt?: string }>
      needsMaintenance?: boolean
    }>
  }>
  generalNotes: string
  staffSignature?: {
    role: 'staff' | 'tenant'
    signedByUserId: string | null
    signedByName: string
    signedAt: string
    method: 'in_app_ack' | 'staff_recorded'
    note?: string
  } | null
  tenantSignature?: {
    role: 'staff' | 'tenant'
    signedByUserId: string | null
    signedByName: string
    signedAt: string
    method: 'in_app_ack' | 'staff_recorded'
    note?: string
  } | null
  noShowOverride?: {
    byUserId: string
    byName: string
    at: string
    reason: string
    kind: 'tenant_no_show' | 'admin_override'
  } | null
  /** Soft-gate flag for keys / move-in (incoming). */
  ingoingPcrSigned: boolean
  createdAt: string
  updatedAt: string
}

export type ViewingSlot = {
  id: string
  agencyId: string
  propertyId: string
  agentId: string
  date: string
  time: string
  capacity: number
  booked: number
  status: 'Open' | 'Full' | 'Cancelled'
  title?: string
  notes?: string
  durationMinutes?: number
}

export type Viewing = {
  id: string
  agencyId: string
  propertyId: string
  agentId: string
  slotId: string | null
  applicantName: string
  applicantEmail?: string
  date: string
  time: string
  status: 'Scheduled' | 'Completed' | 'No-show' | 'Cancelled'
  attendance: string
  viewingMode?: 'IN_PERSON' | 'VIRTUAL'
  feedback?: string
  notes?: string
  tenantConsentStatus?: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'NOT_REQUIRED'
  tenantProposedStartsAt?: string
}

export type PaymentAttachment = {
  id: string
  name: string
  kind: 'image' | 'document'
  mimeType: string
  /** Demo storage as data URL (images / PDFs) */
  dataUrl: string
  uploadedAt: string
  uploadedByName?: string | null
}

export type PaymentRecord = {
  id: string
  agencyId: string
  propertyId: string
  applicationId: string | null
  tenancyId: string | null
  partyName: string
  partyUserId: string | null
  type: 'Deposit' | 'First Month Rent' | 'Rent' | 'Sale Deposit' | 'Commission' | 'Refund' | 'Other'
  amount: number
  status: 'Due' | 'Paid' | 'Overdue' | 'Cancelled'
  dueDate: string
  paidAt: string | null
  method: string | null
  /** Landlord sees amount without applicant contact details when true */
  landlordVisible: boolean
  /** Bank / receipt / transfer reference captured at settlement */
  reference?: string | null
  /** Amount actually received (may differ from billed amount) */
  paidAmount?: number | null
  /** Free-text settlement notes (purchase proof, remittance, etc.) */
  notes?: string | null
  /** Receipts, POP images, invoices linked to this payment */
  attachments?: PaymentAttachment[]
  recordedByUserId?: string | null
  recordedByName?: string | null
}

/** Lease e-sign snapshot — see src/lib/lease (roadmap Step 5). */
export type TenancyESign = {
  status:
    | 'not_started'
    | 'generated'
    | 'sent'
    | 'partially_signed'
    | 'completed'
    | 'declined'
    | 'failed'
  provider: string
  live: boolean
  nonProduction: boolean
  envelopeId: string | null
  externalReference: string | null
  leaseDocumentId: string | null
  pdfUrl: string | null
  tenant: {
    status: 'pending' | 'signed' | 'declined' | 'waived'
    signedAt?: string
    signerName?: string
    signatureDataUrl?: string
  }
  landlord: {
    status: 'pending' | 'signed' | 'declined' | 'waived'
    signedAt?: string
    signerName?: string
    signatureDataUrl?: string
  } | null
  events: Array<{ at: string; type: string; party?: 'tenant' | 'landlord'; summary: string }>
  note?: string
}

export type Tenancy = {
  id: string
  agencyId: string
  propertyId: string
  landlordId: string
  agentId: string | null
  applicationId: string | null
  tenantUserId: string | null
  tenantName: string
  tenantEmail: string
  startDate: string
  endDate: string | null
  rent: number
  deposit: number
  /** Postgres leases.rent_due_day (1–28). Default 1 — monthly Rent dueDate day. */
  rentDueDay?: number
  status: 'Pending Move-In' | 'Active' | 'Ended'
  /** Raw leases.status from the API (bootstrap); absent in local demo data. */
  leaseStatus?: 'pending' | 'active' | 'notice' | 'ended' | 'cancelled'
  keyCollection: {
    location: string
    instructions: string
    contactName: string
    contactPhone: string
  }
  /** PropertyDocument id for the generated lease PDF (category Lease). */
  leaseDocumentId?: string | null
  /** Data URL or storage URL for the lease PDF. */
  leasePdfUrl?: string | null
  /** Real e-sign status — workflow stages must mirror this, not decorate. */
  eSign?: TenancyESign | null
  /**
   * Mode A year-ops renewal + soft CPA notice clock (in-app book).
   * Persisted in leases.metadata.renewalOps. Mirrors src/lib/renewals.
   */
  renewalOps?: TenancyRenewalOpsRecord | null
  /**
   * Soft BillingSchedule on the occupancy — wires dead escalationPct / nextEscalationOn.
   * Persisted in leases.metadata.billingSchedule. Staff-set %; not live CPI.
   */
  billingSchedule?: BillingSchedule | null
}

/** Soft Mode A renewal ops (mirrors src/lib/renewals TenancyRenewalOps). */
export type TenancyRenewalOpsRecord = {
  election: 'none' | 'offered' | 'accepted' | 'declined' | 'month_to_month'
  offeredAt: string | null
  offeredEndDate: string | null
  offeredRent: number | null
  offeredTermMonths: number
  acceptedAt: string | null
  declinedAt: string | null
  noticeGivenAt: string | null
  monthToMonthNote: string | null
  cpaNotice: {
    windowOpen: string | null
    windowClose: string | null
    noticeSentAt: string | null
    late: boolean
    lateFlagNote: string | null
  }
  auditNotes: string[]
}

export type MessageThread = {
  id: string
  agencyId: string
  propertyId: string | null
  applicationId: string | null
  subject: string
  participantIds: string[]
  /** Mode A: agency/agent staff threads, or direct owner↔tenant (landlord). */
  routesTo: 'agency' | 'agent' | 'landlord'
  updatedAt: string
}

export type Message = {
  id: string
  threadId: string
  agencyId: string
  fromUserId: string
  body: string
  at: string
}

export type SuiteAlertAction = 'created' | 'updated' | 'deleted'

export type SuiteAlertResource =
  | 'property'
  | 'room'
  | 'inventory'
  | 'applicant'
  | 'viewing'
  | 'viewing_slot'
  | 'maintenance'
  | 'payment'
  | 'document'
  | 'message'

export type SuiteAlertRule = {
  id: string
  agencyId: string | null
  resource: SuiteAlertResource
  actions: SuiteAlertAction[]
  enabled: boolean
  popupEnabled: boolean
  popupDurationMs: number
  notifyRoles: Role[]
}

export type AppNotification = {
  id: string
  userId: string
  agencyId: string | null
  title: string
  body: string
  at: string
  read: boolean
  link?: string
  resource?: SuiteAlertResource
  action?: SuiteAlertAction
  /** Set when created via admin broadcast */
  broadcastId?: string
}

export type NotificationBroadcast = {
  id: string
  title: string
  body: string
  link?: string
  audience: 'everyone' | 'agency' | 'person'
  agencyId: string | null
  userId: string | null
  createdByUserId: string
  createdAt: string
  recipientCount: number
}

export type MaintenanceTicket = {
  id: string
  agencyId: string
  propertyId: string
  unitId?: string | null
  internalAssetId?: string | null
  categoryKey?: string
  assetLabel: string
  reportedBy: string
  reportedByUserId: string | null
  /**
   * Tenancy (lease) this ticket is for, when staff raise it for a tenant or a
   * tenant files it on their own lease. Stored as maintenance_tickets.lease_id.
   */
  tenancyId?: string | null
  title: string
  priority: 'Low' | 'Medium' | 'High' | 'Urgent' | 'Emergency'
  status: 'Requested' | 'In Progress' | 'Awaiting Parts' | 'Completed' | 'Cancelled'
  contractorId: string | null
  assignedAgentId: string | null
  cost: number
  /** Count of attached issue photos (kept in sync with photoUrls). */
  photos: number
  openedAt: string
  /** Precise open timestamp for SLA / emergency escalation */
  openedAtIso?: string
  description: string
  /** Where on site — room, unit area, access point */
  locationDetail?: string
  /** Gate codes, pet on premises, best time to access */
  accessNotes?: string
  /** Tenant / owner preferred attendance window */
  preferredSchedule?: string
  /** Quick tags e.g. leak, no hot water, safety */
  issueTags?: string[]
  /** Issue photos as data URLs or hosted paths */
  photoUrls?: string[]
  /** Work performed notes captured when closing the ticket */
  resolutionNotes?: string | null
  resolvedAt?: string | null
  warrantyCovered?: boolean
  escalatedAt?: string | null
  contractorAssignedAt?: string | null
  estimatedCost?: number | null
  /** Who fixes it, snapshotted from the unit's maintenance rules (migration 029). */
  responsibleParty?: 'LANDLORD' | 'TENANT' | 'BODY_CORPORATE' | 'SHARED' | null
  ruleItemId?: string | null
  /** Gas, electrical, flooding, security, sewage or structural hazard reported. */
  isSafetyFlag?: boolean
  overrideReason?: string | null
  /** Create only: tenant acknowledged a TENANT-responsible repair may be charged to them. */
  costNoticeAcknowledged?: boolean
}

/** Agency-approved vendor linked to maintenance routing. */
export type AgencyContractor = {
  id: string
  agencyId: string
  contractorUserId: string
  status: 'approved' | 'pending' | 'suspended'
  /** Trade / category keys this vendor handles */
  trades: string[]
  notes?: string
  addedAt: string
  addedByUserId: string | null
  /** Optional rating 1–5 from completed jobs */
  rating?: number | null
  jobsCompleted?: number
}

export type Activity = {
  id: string
  agencyId: string | null
  text: string
  at: string
  user: string
}

/** Property-scoped file register (title deed, compliance, etc.) */
export type PropertyDocument = {
  id: string
  agencyId: string
  propertyId: string
  name: string
  category: 'Title' | 'Compliance' | 'Lease' | 'Inspection' | 'Marketing' | 'Other'
  status: DocStatus
  uploadedAt: string | null
  note?: string
  /** Optional download / preview URL (demo may use placeholder) */
  fileUrl?: string | null
  /** When sourced from an accepted applicant pack */
  applicationId?: string | null
  applicantName?: string | null
  /** Tenancy (lease) the document belongs to, when linked. */
  tenancyId?: string | null
  /** FE user id of the uploader, when known. */
  uploadedByUserId?: string | null
  /** Raw backend document type (TITLE, ID, INVOICE, …) when loaded from Postgres. */
  sourceType?: string | null
}

export type PropertyEventChange = {
  field: string
  from: string
  to: string
}

/** Jira-style property history event */
export type PropertyEvent = {
  id: string
  agencyId: string
  propertyId: string
  actorUserId: string | null
  actorName: string
  action: string
  at: string
  changes?: PropertyEventChange[]
}

/** Applicant / tenant feedback targets */
export type ReviewTargetType = 'property' | 'application' | 'agent'

/**
 * Public reviews — property & application reviews surface on the listing page;
 * agent reviews attach to the listing agent (and agent profile when present).
 */
export type Review = {
  id: string
  targetType: ReviewTargetType
  /** Property id, application id, or agent user id */
  targetId: string
  /** Always set for property/application reviews; optional for agent-only */
  propertyId: string | null
  agencyId: string | null
  authorUserId: string
  authorName: string
  rating: number
  body: string
  createdAt: string
}

// ────────────────────────────────────────────────────────────────
// Trust / Banking Module Types (§1 of spec)
// ────────────────────────────────────────────────────────────────

/** Money stored as integer cents + ISO currency code. Never float. */
export type Money = {
  amountCents: number
  currency: 'ZAR'
}

/** Bank account — encrypted at rest, display masked. */
export type BankAccount = {
  id: string
  agencyId: string
  ownerType: 'agency_trust' | 'agency_trading' | 'landlord' | 'tenant' | 'contractor' | 'beneficiary'
  ownerId: string
  accountName: string
  bankName: string
  branchCode: string
  /** Encrypted account number — never exposed */
  accountNumberEnc: string
  /** Last 4 digits for display */
  accountNumberLast4: string
  accountType: string
  verificationStatus: 'unverified' | 'verified' | 'failed'
  isS54_1: boolean
  isS54_2: boolean
  ppraNotifiedAt: string | null
  currency: 'ZAR'
  createdAt: string
  updatedAt: string
}

/** Trust account per agency (one default). */
export type TrustAccount = {
  id: string
  agencyId: string
  bankAccountId: string
  mode: 'partner' | 'manual'
  partnerCode: string | null
  exemptionLetterDocumentId: string | null
  exemptionExpiresOn: string | null
  auditorName: string | null
  fyEndMonth: number
  createdAt: string
  updatedAt: string
}

/** Billing schedule for an occupancy (rent day, amount, escalation). */
export type BillingSchedule = {
  id: string
  agencyId: string
  occupancyId: string
  chargeType: string
  amountCents: number
  dayOfMonth: number
  startOn: string
  endOn: string | null
  escalationPct: number | null
  nextEscalationOn: string | null
  createdAt: string
  updatedAt: string
}

/** Charge row generated by nightly billing job. */
export type Charge = {
  id: string
  agencyId: string
  occupancyId: string
  propertyId: string
  unitId: string | null
  chargeType: string
  periodStart: string
  periodEnd: string
  dueOn: string
  amountCents: number
  vatCents: number
  status: 'draft' | 'posted' | 'partially_settled' | 'settled' | 'written_off' | 'void'
  idempotencyKey: string
  notes: string | null
  createdAt: string
  updatedAt: string
}

/** Immutable cash event from bank or partner. */
export type TrustTransaction = {
  id: string
  agencyId: string
  direction: 'in' | 'out'
  amountCents: number
  currency: 'ZAR'
  valueDate: string
  postedAt: string
  partnerTxnId: string | null
  bankRef: string | null
  description: string
  counterpartyHash: string | null
  status: 'received' | 'recognised' | 'allocated' | 'split_allocated' | 'unallocated' | 'reversed'
  rawPayloadDocumentId: string | null
  createdAt: string
  updatedAt: string
}

/** Allocation of a trust transaction to a bucket/occupancy. */
export type TrustAllocation = {
  id: string
  agencyId: string
  trustTransactionId: string
  occupancyId: string | null
  bucketCode: string
  chargeId: string | null
  amountCents: number
  allocatedBy: string
  allocatedAt: string
}

/** Payout rule per property (waterfall order). */
export type PayoutRule = {
  id: string
  agencyId: string
  propertyId: string
  sortOrder: number
  ruleType: 'float_topup' | 'commission_pct' | 'commission_fixed' | 'beneficiary_split' | 'pay_contractors' | 'residual_owner'
  params: Record<string, unknown>
  active: boolean
  createdAt: string
  updatedAt: string
}

/** Payout instruction — proposed, approved, submitted, settled, or failed. */
export type PayoutInstruction = {
  id: string
  agencyId: string
  occupancyId: string | null
  propertyId: string
  payeeType: string
  payeeId: string
  bankAccountId: string
  amountCents: number
  bucketCode: string
  status: 'proposed' | 'pending_approval' | 'approved' | 'submitted' | 'settled' | 'failed' | 'cancelled'
  proposedBy: string
  approvedBy: string | null
  submittedAt: string | null
  settledAt: string | null
  partnerPayoutId: string | null
  failureReason: string | null
  idempotencyKey: string
  createdAt: string
  updatedAt: string
}

/** Deposit holding per occupancy. */
export type DepositHolding = {
  id: string
  agencyId: string
  occupancyId: string
  expectedCents: number
  heldCents: number
  interestAccruedCents: number
  status: 'expected' | 'held' | 'release_proposed' | 'release_approved' | 'refunded' | 'applied_to_arrears' | 'split' | 'disputed'
  statutoryDeadlineOn: string | null
  interestRateUnknown: boolean
  /** Dual-control: who proposed release (null until propose). */
  releaseProposedBy: string | null
  /** Dual-control: who approved release (null until approve; must ≠ proposer). */
  releaseApprovedBy: string | null
  /** D2: recorded refund split (read back from event_log). Recorded only, never bank-confirmed. */
  refund?: DepositRefundRecord | null
  createdAt: string
  updatedAt: string
}

export type DepositRefundRecord = {
  refundedCents: number
  deductions: { reason: string; amountCents: number }[]
  interestCents: number
  /** Staff user who entered the interest figure. */
  interestEnteredBy?: string
  heldCents: number
  recordedBy: string
  recordedAt: string
  bankConfirmed: false
}

/** Daily arrears snapshot. */
export type ArrearsSnapshot = {
  id: string
  agencyId: string
  occupancyId: string
  asOf: string
  currentCents: number
  d30: number
  d60: number
  d90: number
  d90plus: number
  createdAt: string
}

/** CSV import batch for bank statements. */
export type CsvImportBatch = {
  id: string
  agencyId: string
  filename: string
  rowCount: number
  importedAt: string
  importedBy: string
  status: 'processing' | 'completed' | 'failed'
}

/** Extended payment record with trust fields. */
export type TrustLinkedPayment = PaymentRecord & {
  trustTransactionId: string | null
  chargeId: string | null
  clearedInTrust: boolean
}

/** CR10: server-written lease_signed audit row (bootstrap, scoped per actor). Never the image. */
export type LeaseSignEvent = {
  id: string
  tenancyId: string
  agencyId?: string | null
  envelopeId: string | null
  party: 'tenant' | 'landlord'
  signerUserId: string | null
  role: string | null
  method: 'drawn' | 'saved_image' | 'paper_mark' | string | null
  onBehalf: boolean
  onBehalfConfirmation?: string | null
  imageSha256: string | null
  signedAt: string | null
  /** Staff only (stripped server-side for tenant / landlord / contractor). */
  ip?: string | null
  userAgent?: string | null
}
