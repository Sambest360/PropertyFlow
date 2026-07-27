import type { LookupConfig } from './infrastructure'

export const GLOBAL_CLIENT_ID = 'global'

export type ConfigTypeDef = {
  type: string
  label: string
  description: string
  /** Domain group for the configuration catalogue UI. */
  group: ConfigGroupId
  /** Keys that cannot be deactivated (workflow-critical). */
  requiredKeys: string[]
}

export type ConfigGroupId =
  | 'property'
  | 'sales'
  | 'maintenance'
  | 'documents'
  | 'payments'
  | 'tenancy'
  | 'other'

export const CONFIG_GROUPS: Array<{ id: ConfigGroupId; label: string; blurb: string }> = [
  { id: 'property', label: 'Property', blurb: 'Types, statuses, listings, rooms, amenities' },
  { id: 'sales', label: 'Sales', blurb: 'Leads, applications, viewings' },
  { id: 'maintenance', label: 'Maintenance', blurb: 'Categories, priorities, ticket statuses' },
  { id: 'documents', label: 'Documents', blurb: 'Document types and review states' },
  { id: 'payments', label: 'Payments', blurb: 'Statuses, types, and collection methods' },
  { id: 'tenancy', label: 'Tenancy', blurb: 'Lease and occupancy lifecycle' },
  { id: 'other', label: 'Other', blurb: 'Internal assets and grading' },
]

export const CONFIG_TYPE_DEFS: ConfigTypeDef[] = [
  {
    type: 'PROPERTY_TYPE',
    label: 'Property types',
    description: 'Listing / portfolio property types.',
    group: 'property',
    requiredKeys: ['House', 'Apartment'],
  },
  {
    type: 'PROPERTY_STATUS',
    label: 'Property statuses',
    description: 'Marketing / listing statuses for assets.',
    group: 'property',
    requiredKeys: ['Draft', 'Published', 'Archived'],
  },
  {
    type: 'UNIT_STATUS',
    label: 'Unit statuses',
    description: 'Operational occupancy statuses for units.',
    group: 'property',
    requiredKeys: ['VACANT', 'OCCUPIED', 'MAINTENANCE'],
  },
  {
    type: 'LISTING_MODE',
    label: 'Listing modes',
    description: 'Sale, rent, or both.',
    group: 'property',
    requiredKeys: ['sale', 'rent', 'both'],
  },
  {
    type: 'LEAD_STAGE',
    label: 'Lead stages',
    description: 'CRM pipeline stages.',
    group: 'sales',
    requiredKeys: ['New Lead', 'Contacted'],
  },
  {
    type: 'APPLICATION_STAGE',
    label: 'Application stages',
    description: 'Applicant → move-in lifecycle stages.',
    group: 'sales',
    requiredKeys: ['Started', 'Approved', 'Rejected', 'Withdrawn'],
  },
  {
    type: 'DOC_TYPE',
    label: 'Document types',
    description: 'Application and property document categories.',
    group: 'documents',
    requiredKeys: ['ID', 'Lease'],
  },
  {
    type: 'DOC_STATUS',
    label: 'Document statuses',
    description: 'Document review states.',
    group: 'documents',
    requiredKeys: ['required', 'uploaded', 'verified', 'rejected'],
  },
  {
    type: 'TICKET_CATEGORY',
    label: 'Maintenance categories',
    description: 'Maintenance ticket categories.',
    group: 'maintenance',
    requiredKeys: ['GENERAL'],
  },
  {
    type: 'TICKET_STATUS',
    label: 'Maintenance statuses',
    description: 'Ticket workflow statuses.',
    group: 'maintenance',
    requiredKeys: ['Requested', 'In Progress', 'Completed', 'Cancelled'],
  },
  {
    type: 'TICKET_PRIORITY',
    label: 'Maintenance priorities',
    description: 'Ticket priority levels.',
    group: 'maintenance',
    requiredKeys: ['Emergency', 'High', 'Medium', 'Low'],
  },
  {
    type: 'ASSET_TYPE',
    label: 'Internal asset types',
    description: 'In-unit inventory asset types.',
    group: 'other',
    requiredKeys: ['APPLIANCE', 'FURNITURE'],
  },
  {
    type: 'ASSET_CONDITION',
    label: 'Asset conditions',
    description: 'Condition grades for internal assets.',
    group: 'other',
    requiredKeys: ['Excellent', 'Good', 'Fair', 'Damaged'],
  },
  {
    type: 'ROOM_KIND',
    label: 'Room kinds',
    description: 'Floor-plan room classifications.',
    group: 'property',
    requiredKeys: ['bedroom', 'bathroom', 'kitchen', 'living', 'other'],
  },
  {
    type: 'PAYMENT_STATUS',
    label: 'Payment statuses',
    description: 'Rent and fee payment states.',
    group: 'payments',
    requiredKeys: ['Due', 'Paid', 'Overdue', 'Cancelled'],
  },
  {
    type: 'PAYMENT_TYPE',
    label: 'Payment types',
    description: 'Kinds of payments recorded.',
    group: 'payments',
    requiredKeys: ['Rent', 'Deposit'],
  },
  {
    type: 'PAY_METHOD',
    label: 'Payment methods',
    description: 'How payments are collected.',
    group: 'payments',
    requiredKeys: ['EFT', 'Card'],
  },
  {
    type: 'VIEWING_STATUS',
    label: 'Viewing statuses',
    description: 'Booking statuses for viewings.',
    group: 'sales',
    requiredKeys: ['Scheduled', 'Completed', 'Cancelled'],
  },
  {
    type: 'TENANCY_STATUS',
    label: 'Tenancy statuses',
    description: 'Occupancy / lease lifecycle.',
    group: 'tenancy',
    requiredKeys: ['Pending Move-In', 'Active', 'Ended'],
  },
  {
    type: 'AMENITY',
    label: 'Amenities',
    description: 'Property amenity tags.',
    group: 'property',
    requiredKeys: [],
  },
  {
    type: 'BUILDING_GRADING',
    label: 'Building grades',
    description: 'Commercial / residential grading.',
    group: 'other',
    requiredKeys: ['P', 'A', 'B', 'C'],
  },
]

type SeedItem = { key: string; label: string }

const PLATFORM_CATALOGUE: Record<string, SeedItem[]> = {
  PROPERTY_TYPE: [
    { key: 'House', label: 'House' },
    { key: 'Apartment', label: 'Apartment' },
    { key: 'Townhouse', label: 'Townhouse' },
    { key: 'Commercial', label: 'Commercial' },
    { key: 'Office', label: 'Office' },
    { key: 'Vacant Land', label: 'Vacant Land' },
    { key: 'Student Accommodation', label: 'Student Accommodation' },
  ],
  PROPERTY_STATUS: [
    { key: 'Draft', label: 'Draft' },
    { key: 'Published', label: 'Published' },
    { key: 'Featured', label: 'Featured' },
    { key: 'Under Offer', label: 'Under Offer' },
    { key: 'Sold', label: 'Sold' },
    { key: 'Rented', label: 'Rented' },
    { key: 'Archived', label: 'Archived' },
    { key: 'Maintenance', label: 'Maintenance' },
  ],
  UNIT_STATUS: [
    { key: 'VACANT', label: 'Vacant' },
    { key: 'OCCUPIED', label: 'Occupied' },
    { key: 'UNDER_OFFER', label: 'Under Offer' },
    { key: 'MAINTENANCE', label: 'Maintenance' },
    { key: 'DRAFT', label: 'Draft' },
    { key: 'PUBLISHED', label: 'Published' },
    { key: 'FEATURED', label: 'Featured' },
  ],
  LISTING_MODE: [
    { key: 'sale', label: 'For sale' },
    { key: 'rent', label: 'For rent' },
    { key: 'both', label: 'Sale & rent' },
  ],
  LEAD_STAGE: [
    { key: 'New Lead', label: 'New Lead' },
    { key: 'Contacted', label: 'Contacted' },
    { key: 'Viewing Scheduled', label: 'Viewing Scheduled' },
    { key: 'Viewing Completed', label: 'Viewing Completed' },
    { key: 'Application Submitted', label: 'Application Submitted' },
    { key: 'Credit Check', label: 'Credit Check' },
    { key: 'Offer Sent', label: 'Offer Sent' },
    { key: 'Deposit Paid', label: 'Deposit Paid' },
    { key: 'Lease Signed', label: 'Lease Signed' },
    { key: 'Sale Completed', label: 'Sale Completed' },
  ],
  APPLICATION_STAGE: [
    { key: 'Started', label: 'Started' },
    { key: 'Documents Pending', label: 'Documents Pending' },
    { key: 'Documents Submitted', label: 'Documents Submitted' },
    { key: 'Viewing Booked', label: 'Viewing Booked' },
    { key: 'Under Review', label: 'Under Review' },
    { key: 'Credit Check', label: 'Credit Check' },
    { key: 'Approved', label: 'Approved' },
    { key: 'Awaiting Payment', label: 'Awaiting Payment' },
    { key: 'Deposit Paid', label: 'Deposit Paid' },
    { key: 'Lease Signed', label: 'Lease Signed' },
    { key: 'Move-In Scheduled', label: 'Move-In Scheduled' },
    { key: 'Keys Handed Over', label: 'Keys Handed Over' },
    { key: 'Active Tenancy', label: 'Active Tenancy' },
    { key: 'Rejected', label: 'Rejected' },
    { key: 'Withdrawn', label: 'Withdrawn' },
    { key: 'Blocked', label: 'Blocked' },
  ],
  DOC_TYPE: [
    { key: 'ID', label: 'ID' },
    { key: 'Payslip', label: 'Payslip' },
    { key: 'Bank statement', label: 'Bank statement' },
    { key: 'Lease', label: 'Lease' },
    { key: 'Title deed', label: 'Title deed' },
    { key: 'FICA', label: 'FICA' },
  ],
  DOC_STATUS: [
    { key: 'required', label: 'Required' },
    { key: 'uploaded', label: 'Uploaded' },
    { key: 'verified', label: 'Verified' },
    { key: 'rejected', label: 'Rejected' },
  ],
  TICKET_CATEGORY: [
    { key: 'PLUMBING', label: 'Plumbing' },
    { key: 'ELECTRICAL', label: 'Electrical' },
    { key: 'HVAC', label: 'HVAC' },
    { key: 'APPLIANCE', label: 'Appliance' },
    { key: 'APPLIANCE_FAILURE', label: 'Appliance failure' },
    { key: 'APPLIANCE_FAULT', label: 'Appliance fault' },
    { key: 'STRUCTURAL', label: 'Structural' },
    { key: 'GENERAL', label: 'General' },
  ],
  TICKET_STATUS: [
    { key: 'Requested', label: 'Requested' },
    { key: 'In Progress', label: 'In Progress' },
    { key: 'Awaiting Parts', label: 'Awaiting Parts' },
    { key: 'Completed', label: 'Completed' },
    { key: 'Cancelled', label: 'Cancelled' },
  ],
  TICKET_PRIORITY: [
    { key: 'Emergency', label: 'Emergency' },
    { key: 'Urgent', label: 'Urgent' },
    { key: 'High', label: 'High' },
    { key: 'Medium', label: 'Medium' },
    { key: 'Low', label: 'Low' },
  ],
  ASSET_TYPE: [
    { key: 'APPLIANCE', label: 'Appliance' },
    { key: 'FURNITURE', label: 'Furniture' },
    { key: 'ELECTRONICS', label: 'Electronics' },
    { key: 'FIXTURE', label: 'Fixture' },
  ],
  ASSET_CONDITION: [
    { key: 'Excellent', label: 'Excellent' },
    { key: 'Good', label: 'Good' },
    { key: 'Fair', label: 'Fair' },
    { key: 'Damaged', label: 'Damaged' },
    { key: 'Needs replacement', label: 'Needs replacement' },
  ],
  ROOM_KIND: [
    { key: 'bedroom', label: 'Bedroom' },
    { key: 'bathroom', label: 'Bathroom' },
    { key: 'kitchen', label: 'Kitchen' },
    { key: 'living', label: 'Living / Lounge' },
    { key: 'dining', label: 'Dining' },
    { key: 'study', label: 'Study' },
    { key: 'garage', label: 'Garage' },
    { key: 'other', label: 'Other' },
  ],
  PAYMENT_STATUS: [
    { key: 'Due', label: 'Due' },
    { key: 'Paid', label: 'Paid' },
    { key: 'Overdue', label: 'Overdue' },
    { key: 'Cancelled', label: 'Cancelled' },
  ],
  PAYMENT_TYPE: [
    { key: 'Deposit', label: 'Deposit' },
    { key: 'First Month Rent', label: 'First Month Rent' },
    { key: 'Rent', label: 'Rent' },
    { key: 'Sale Deposit', label: 'Sale Deposit' },
    { key: 'Commission', label: 'Commission' },
    { key: 'Refund', label: 'Refund' },
    { key: 'Other', label: 'Other' },
  ],
  PAY_METHOD: [
    { key: 'EFT', label: 'EFT' },
    { key: 'Card', label: 'Card' },
    { key: 'Cash', label: 'Cash' },
    { key: 'Debit order', label: 'Debit order' },
    { key: 'Instant EFT', label: 'Instant EFT' },
    { key: 'Cheque', label: 'Cheque' },
    { key: 'Other', label: 'Other' },
  ],
  VIEWING_STATUS: [
    { key: 'Scheduled', label: 'Scheduled' },
    { key: 'Completed', label: 'Completed' },
    { key: 'No-show', label: 'No-show' },
    { key: 'Cancelled', label: 'Cancelled' },
  ],
  TENANCY_STATUS: [
    { key: 'Pending Move-In', label: 'Pending Move-In' },
    { key: 'Active', label: 'Active' },
    { key: 'Ended', label: 'Ended' },
  ],
  AMENITY: [
    { key: 'Fibre', label: 'Fibre' },
    { key: 'Pool', label: 'Pool' },
    { key: 'Garden', label: 'Garden' },
    { key: 'Parking', label: 'Parking' },
    { key: 'Security Estate', label: 'Security Estate' },
    { key: 'Pet Friendly', label: 'Pet Friendly' },
    { key: 'Furnished', label: 'Furnished' },
    { key: 'Unfurnished', label: 'Unfurnished' },
    { key: 'Solar', label: 'Solar' },
    { key: 'Generator', label: 'Generator' },
    { key: 'Borehole', label: 'Borehole' },
    { key: 'Gym', label: 'Gym' },
    { key: 'Concierge', label: 'Concierge' },
    { key: 'Balcony', label: 'Balcony' },
  ],
  BUILDING_GRADING: [
    { key: 'P', label: 'Grade P' },
    { key: 'A', label: 'Grade A' },
    { key: 'B', label: 'Grade B' },
    { key: 'C', label: 'Grade C' },
  ],
}

function buildLookupsForClient(clientId: string, idPrefix: string): LookupConfig[] {
  const rows: LookupConfig[] = []
  for (const def of CONFIG_TYPE_DEFS) {
    const items = PLATFORM_CATALOGUE[def.type] ?? []
    items.forEach((item, i) => {
      rows.push({
        id: `${idPrefix}-${def.type.toLowerCase()}-${i}`,
        clientId,
        configType: def.type,
        keyValue: item.key,
        displayLabel: item.label,
        isActive: true,
        sortOrder: i,
      })
    })
  }
  return rows
}

/** Global catalogue visible to every agency (`clientId: global`). */
export const platformDefaultLookups: LookupConfig[] = buildLookupsForClient(GLOBAL_CLIENT_ID, 'lk-global')

/** Optional helper to copy globals into an agency as agency-only rows. */
export function cloneLookupsForClient(clientId: string, idPrefix?: string): LookupConfig[] {
  const prefix = idPrefix ?? `lk-${clientId}`
  return platformDefaultLookups.map((row, i) => ({
    ...row,
    id: `${prefix}-${i}`,
    clientId,
  }))
}

/** Seed: globals only — agencies see globals ∪ their own linked rows. */
export function buildSeedLookups(_agencyIds?: string[]): LookupConfig[] {
  return [...platformDefaultLookups]
}

/** @deprecated use GLOBAL_CLIENT_ID */
export const PLATFORM_CLIENT_ID = GLOBAL_CLIENT_ID

export function isRequiredLookupKey(configType: string, keyValue: string): boolean {
  const def = CONFIG_TYPE_DEFS.find((d) => d.type === configType)
  return def?.requiredKeys.includes(keyValue) ?? false
}

export function slugifyLookupKey(label: string): string {
  return label
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9_\-]/g, '')
    .toUpperCase()
    .slice(0, 80)
}
