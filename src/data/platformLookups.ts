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
  | 'applications'
  | 'documents'
  | 'maintenance'
  | 'payments'
  | 'inventory'

export const CONFIG_GROUPS: Array<{ id: ConfigGroupId; label: string; blurb: string }> = [
  { id: 'property', label: 'Property', blurb: 'Property types and extra features' },
  { id: 'sales', label: 'Sales', blurb: 'Lead pipeline stages' },
  { id: 'applications', label: 'Applications', blurb: 'Choices applicants pick from' },
  { id: 'documents', label: 'Documents', blurb: 'Documents you ask for' },
  { id: 'maintenance', label: 'Maintenance', blurb: 'Fault categories' },
  { id: 'payments', label: 'Payments', blurb: 'How payments are received' },
  { id: 'inventory', label: 'Inventory', blurb: 'In-unit item types' },
]

/**
 * Only lists an agency genuinely customises AND the app reads. Statuses,
 * stages, listing modes, priorities and grading are app rules with fixed
 * meaning, so they are not configurable here. Edits save per agency as
 * overrides of these defaults (see AppStore lookup actions).
 */
export const CONFIG_TYPE_DEFS: ConfigTypeDef[] = [
  {
    type: 'PROPERTY_TYPE',
    label: 'Property types',
    description: 'The types offered in Add property and in the Properties filter.',
    group: 'property',
    requiredKeys: ['House', 'Apartment'],
  },
  {
    type: 'AMENITY',
    label: 'Extra features',
    description:
      "Features your agency adds to Add property's feature list, on top of the built-in ones (pool, fibre, security…).",
    group: 'property',
    requiredKeys: [],
  },
  {
    type: 'LEAD_STAGE',
    label: 'Lead stages',
    description: 'The columns of your Leads pipeline. Step requirements are set in Admin → Lead pipeline.',
    group: 'sales',
    requiredKeys: ['New Lead', 'Contacted', 'Viewing Scheduled', 'Viewing Completed'],
  },
  {
    type: 'DOC_TYPE',
    label: 'Document types',
    description: 'Documents a lead stage can require (set in Admin → Lead pipeline).',
    group: 'documents',
    requiredKeys: ['ID', 'Lease'],
  },
  {
    type: 'JOB_TITLE',
    label: 'Job titles',
    description: 'The job titles applicants choose from when applying and on their application details ("Other" lets them type one).',
    group: 'applications',
    requiredKeys: [],
  },
  {
    type: 'TICKET_CATEGORY',
    label: 'Maintenance categories',
    description: 'The categories offered when logging or editing a maintenance ticket.',
    group: 'maintenance',
    requiredKeys: ['GENERAL'],
  },
  {
    type: 'PAY_METHOD',
    label: 'Payment methods',
    description: 'The methods offered when marking a payment as paid.',
    group: 'payments',
    requiredKeys: ['EFT', 'Card'],
  },
  {
    type: 'ASSET_TYPE',
    label: 'Asset types',
    description: "Item types for a property's inventory (Add property and the Inventory tab).",
    group: 'inventory',
    requiredKeys: ['APPLIANCE', 'FURNITURE'],
  },
]

type SeedItem = { key: string; label: string }

export const PLATFORM_CATALOGUE: Record<string, SeedItem[]> = {
  PROPERTY_TYPE: [
    { key: 'House', label: 'House' },
    { key: 'Apartment', label: 'Apartment' },
    { key: 'Townhouse', label: 'Townhouse' },
    { key: 'Commercial', label: 'Commercial' },
    { key: 'Office', label: 'Office' },
    { key: 'Vacant Land', label: 'Vacant Land' },
    { key: 'Student Accommodation', label: 'Student Accommodation' },
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
    { key: 'Rejected', label: 'Rejected' },
  ],
  DOC_TYPE: [
    { key: 'ID', label: 'ID' },
    { key: 'Payslip', label: 'Payslip' },
    { key: 'Bank statement', label: 'Bank statement' },
    { key: 'Lease', label: 'Lease' },
    { key: 'Title deed', label: 'Title deed' },
    { key: 'FICA', label: 'FICA' },
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
  ASSET_TYPE: [
    { key: 'APPLIANCE', label: 'Appliance' },
    { key: 'FURNITURE', label: 'Furniture' },
    { key: 'ELECTRONICS', label: 'Electronics' },
    { key: 'FIXTURE', label: 'Fixture' },
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
  JOB_TITLE: [
    { key: 'Accountant', label: 'Accountant' },
    { key: 'Administrator', label: 'Administrator' },
    { key: 'Business owner', label: 'Business owner' },
    { key: 'Cashier', label: 'Cashier' },
    { key: 'Civil servant', label: 'Civil servant' },
    { key: 'Consultant', label: 'Consultant' },
    { key: 'Driver', label: 'Driver' },
    { key: 'Engineer', label: 'Engineer' },
    { key: 'Lecturer', label: 'Lecturer' },
    { key: 'Manager', label: 'Manager' },
    { key: 'Nurse', label: 'Nurse' },
    { key: 'Pensioner / retired', label: 'Pensioner / retired' },
    { key: 'Police officer', label: 'Police officer' },
    { key: 'Sales representative', label: 'Sales representative' },
    { key: 'Self-employed', label: 'Self-employed' },
    { key: 'Software developer', label: 'Software developer' },
    { key: 'Student', label: 'Student' },
    { key: 'Teacher', label: 'Teacher' },
    { key: 'Technician', label: 'Technician' },
    { key: 'Unemployed', label: 'Unemployed' },
  ],
  // Agencies add their own extras; built-in features live in src/lib/propertyFeatures.ts.
  AMENITY: [],
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
