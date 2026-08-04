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
