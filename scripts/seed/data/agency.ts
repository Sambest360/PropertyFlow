import { fixedUuid } from '../helpers.js'

export const AGENCY_ID = fixedUuid('b1000001', 1)
export const AGENCY_FE_ID = 'ag-seeff-cb'

export const DEFAULT_AGENCY_PERMISSIONS = [
  'tenant.manage',
  'users.manage',
  'roles.assign',
  'users.impersonate',
  'config.manage',
  'notifications.broadcast',
  'assets.view',
  'assets.manage',
  'listings.publish',
  'leads.view',
  'leads.manage',
  'applications.view',
  'applications.review',
  'viewings.manage',
  'maintenance.view',
  'maintenance.manage',
  'documents.view',
  'payments.view',
  'payments.manage',
  'reports.view',
  'messages.manage',
  'occupants.view',
  'portal.owner',
  'portal.tenant',
  'portal.contractor',
] as const

export const AGENCY = {
  id: AGENCY_ID,
  company_name: 'Seeff City Bowl & Tamboerskloof',
  subdomain: 'seeff-citybowl',
  status: 'active',
  trading_as: 'Seeff Property Group — City Bowl & Tamboerskloof',
  email: 'citybowl@propertyflow.demo',
  phone: '+27 21 200 0999',
  city: 'Cape Town',
  province: 'Western Cape',
  country_code: 'ZA',
  timezone: 'Africa/Johannesburg',
  currency_code: 'ZAR',
  settings: {
    frontend_id: AGENCY_FE_ID,
    enabledPermissions: [...DEFAULT_AGENCY_PERMISSIONS],
    autoAdvanceApplications: true,
    focus: ['Tamboerskloof', 'Gardens', 'Oranjezicht', 'Vredehoek', 'De Waterkant'],
  },
}

export const LOOKUP_CONFIGS: Array<{
  config_type: string
  key_value: string
  display_label: string
  sort_order: number
}> = [
  { config_type: 'PROPERTY_STATUS', key_value: 'ACTIVE', display_label: 'Active', sort_order: 1 },
  { config_type: 'PROPERTY_STATUS', key_value: 'UNDER_MANAGEMENT', display_label: 'Under management', sort_order: 2 },
  { config_type: 'PROPERTY_STATUS', key_value: 'ARCHIVED', display_label: 'Archived', sort_order: 3 },
  { config_type: 'UNIT_STATUS', key_value: 'AVAILABLE', display_label: 'Available', sort_order: 1 },
  { config_type: 'UNIT_STATUS', key_value: 'RESERVED', display_label: 'Reserved', sort_order: 2 },
  { config_type: 'UNIT_STATUS', key_value: 'OCCUPIED', display_label: 'Occupied', sort_order: 3 },
  { config_type: 'UNIT_STATUS', key_value: 'MAINTENANCE', display_label: 'Maintenance', sort_order: 4 },
  { config_type: 'UNIT_STATUS', key_value: 'OFF_MARKET', display_label: 'Off market', sort_order: 5 },
  { config_type: 'TICKET_CATEGORY', key_value: 'PLUMBING', display_label: 'Plumbing', sort_order: 1 },
  { config_type: 'TICKET_CATEGORY', key_value: 'ELECTRICAL', display_label: 'Electrical', sort_order: 2 },
  { config_type: 'TICKET_CATEGORY', key_value: 'HVAC', display_label: 'HVAC', sort_order: 3 },
  { config_type: 'TICKET_CATEGORY', key_value: 'GENERAL', display_label: 'General', sort_order: 4 },
  { config_type: 'TICKET_CATEGORY', key_value: 'APPLIANCE', display_label: 'Appliance', sort_order: 5 },
  { config_type: 'ROOM_KIND', key_value: 'bedroom', display_label: 'Bedroom', sort_order: 1 },
  { config_type: 'ROOM_KIND', key_value: 'bathroom', display_label: 'Bathroom', sort_order: 2 },
  { config_type: 'ROOM_KIND', key_value: 'kitchen', display_label: 'Kitchen', sort_order: 3 },
  { config_type: 'ROOM_KIND', key_value: 'living', display_label: 'Living / Lounge', sort_order: 4 },
  { config_type: 'ASSET_TYPE', key_value: 'APPLIANCE', display_label: 'Appliance', sort_order: 1 },
  { config_type: 'ASSET_TYPE', key_value: 'FURNITURE', display_label: 'Furniture', sort_order: 2 },
  { config_type: 'ASSET_TYPE', key_value: 'ELECTRONICS', display_label: 'Electronics', sort_order: 3 },
]
