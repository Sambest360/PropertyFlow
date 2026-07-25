export type Role =
  | 'super_admin'
  | 'client_admin'
  | 'agent_admin'
  | 'ground_agent'
  /** @deprecated use ground_agent — kept for older demo rows */
  | 'agent'
  | 'landlord'
  | 'tenant'
  | 'contractor'

export type Permission =
  | 'platform.manage'
  | 'tenant.manage'
  | 'users.manage'
  | 'roles.assign'
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
  | 'documents.view'
  | 'payments.view'
  | 'payments.manage'
  | 'reports.view'
  | 'messages.manage'
  | 'occupants.view'
  | 'portal.owner'
  | 'portal.tenant'
  | 'portal.contractor'

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

export type ApplicationDocument = {
  key: string
  label: string
  status: DocStatus
  note?: string
}

export type Agency = {
  id: string
  name: string
  slug: string
  city: string
  status: 'Active' | 'Suspended'
  createdAt: string
}

export type AppUser = {
  id: string
  name: string
  email: string
  role: Role
  agencyId: string | null
  phone?: string
  active: boolean
  avatar?: string
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
  agencyId: string
  landlordId: string
  agentId: string | null
  /** Links flat listing → infrastructure unit when present */
  buildingId?: string | null
  unitId?: string | null
  title: string
  type: string
  status: 'Draft' | 'Published' | 'Featured' | 'Under Offer' | 'Sold' | 'Rented' | 'Archived' | 'Maintenance'
  listingMode: 'sale' | 'rent' | 'both'
  price: number | null
  rent: number | null
  beds: number
  baths: number
  parking: number
  area: number
  city: string
  suburb: string
  address: string
  lat: number
  lng: number
  images: string[]
  floorPlan?: string
  rooms: Room[]
  /** In-unit inventory (microwave, beds, etc.) */
  internalAssets?: InternalAssetItem[]
  amenities: string[]
  description: string
  featured: boolean
  createdAt: string
  /** Green infrastructure (SA-relevant) */
  solarCapacityKw?: number
  hasBorehole?: boolean
  grading?: string | null
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
  stage: string
  type: 'Buy' | 'Rent'
  value: number
  notes: string
  createdAt: string
  updatedAt: string
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
  stage: ApplicationStage
  progress: number
  income: number
  employment: string
  idNumberOrPassport?: string
  uploadedDocs?: ApplicationUploadedDocs
  creditCheck: 'Not Started' | 'Consent Received' | 'In Progress' | 'Passed' | 'Failed' | 'Pending'
  creditConsent: boolean
  documents: ApplicationDocument[]
  /** @deprecated prefer documents[]; kept for display fallbacks */
  docs: string[]
  viewingSlotId: string | null
  notes: string
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
  feedback?: string
  notes?: string
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
  status: 'Pending Move-In' | 'Active' | 'Ended'
  keyCollection: {
    location: string
    instructions: string
    contactName: string
    contactPhone: string
  }
}

export type MessageThread = {
  id: string
  agencyId: string
  propertyId: string | null
  applicationId: string | null
  subject: string
  participantIds: string[]
  /** Tenants message agency/agent only — never landlord */
  routesTo: 'agency' | 'agent'
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
  title: string
  priority: 'Low' | 'Medium' | 'High' | 'Urgent' | 'Emergency'
  status: 'Requested' | 'In Progress' | 'Awaiting Parts' | 'Completed' | 'Cancelled'
  contractorId: string | null
  assignedAgentId: string | null
  cost: number
  photos: number
  openedAt: string
  /** Precise open timestamp for SLA / emergency escalation */
  openedAtIso?: string
  description: string
  /** Work performed notes captured when closing the ticket */
  resolutionNotes?: string | null
  resolvedAt?: string | null
  warrantyCovered?: boolean
  escalatedAt?: string | null
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
