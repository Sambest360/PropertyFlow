import type { Role } from '../types/domain'
import type { PageTour, PageTourStep } from './pageTips'

/**
 * Page guides for every workspace page and role. Used after the hand-written
 * walkthroughs in pageTips.ts, so each role gets a tour on every page it can
 * open. Steps whose target is not on screen are skipped by the walkthrough.
 */

export const STAFF: Role[] = ['client_admin', 'agent_admin', 'ground_agent', 'agent']
export const AGENCY_ADMINS: Role[] = ['client_admin', 'agent_admin']
export const ALL_SIGNED_IN: Role[] = [
  'super_admin',
  'client_admin',
  'agent_admin',
  'ground_agent',
  'agent',
  'landlord',
  'tenant',
  'contractor',
]

const HEADER = '[data-tip-target="page-header"] || main h1'
const ACTIONS = '[data-tip-target="page-actions"]'
const TABS = '[data-tip-target="page-tabs"] || main [role="tablist"]'
const SEARCH =
  '[data-tip-target="page-search"] || main input[type="search"] || main input[placeholder*="earch"]'
const LIST = '[data-tip-target="page-list"] || main table'
const FORM = '[data-tip-target="page-form"] || main form'

export type PageGuide = {
  id: string
  match: (pathname: string) => boolean
  roles: Role[]
  title: string
  intro: string
  bullets?: string[]
  /** What the buttons at the top of the page do. */
  actions?: string
  actionBullets?: string[]
  tabs?: string
  tabBullets?: string[]
  search?: string
  list?: string
  listBullets?: string[]
  form?: string
  formBullets?: string[]
  /** Extra page-specific steps, shown before the "find it again" step. */
  extra?: PageTourStep[]
  /** Sidebar link to point at in the last step. */
  nav?: string
  isNew?: boolean
}

export function exactPath(path: string) {
  return (p: string) => p === path
}

export function idPath(base: string, suffix = '') {
  const re = new RegExp(`^${base.replace(/\//g, '\\/')}/[^/]+${suffix.replace(/\//g, '\\/')}$`)
  return (p: string) => re.test(p) && !p.endsWith('/new')
}

export function buildGuideTour(g: PageGuide): PageTour {
  const steps: PageTourStep[] = [
    { title: g.title, body: g.intro, bullets: g.bullets, placement: 'center', isNew: g.isNew },
  ]
  if (g.actions) {
    steps.push({
      title: 'Page actions',
      body: g.actions,
      bullets: g.actionBullets,
      target: `${ACTIONS} || ${HEADER}`,
      placement: 'below',
    })
  }
  if (g.tabs) {
    steps.push({ title: 'Switch views', body: g.tabs, bullets: g.tabBullets, target: TABS, placement: 'below' })
  }
  if (g.search) {
    steps.push({ title: 'Search and filter', body: g.search, target: SEARCH, placement: 'below' })
  }
  if (g.form) {
    steps.push({ title: 'Fill in the form', body: g.form, bullets: g.formBullets, target: FORM, placement: 'above' })
  }
  if (g.list) {
    steps.push({ title: 'Your list', body: g.list, bullets: g.listBullets, target: LIST, placement: 'above' })
  }
  if (g.extra) steps.push(...g.extra)
  if (g.nav) {
    steps.push({
      title: 'Find it again',
      body: 'This page lives here in the menu. You can switch page tips on or off at any time from your account settings.',
      target: `[data-tip-nav="${g.nav}"] || [data-tip-target="workspace-nav"]`,
      placement: 'below',
    })
  }
  return { id: g.id, steps }
}

export const PAGE_GUIDES: PageGuide[] = [
  // ——— Landlord ———
  {
    id: 'guide-landlord-home',
    match: exactPath('/workspace/portals/owner'),
    roles: ['landlord'],
    title: 'Your portfolio',
    intro: 'This is your landlord dashboard: every property you own, who lives there, what was paid and what needs your attention.',
    bullets: [
      'Rent collected, arrears and payouts for the month',
      'Open maintenance and approvals waiting for you',
      'Your managing agent’s contact details',
    ],
    actions: 'Use these buttons to add a property, open your reports or contact your agent.',
    list: 'Each card or row is one of your properties. Open it to see the lease, tenant, payments and history.',
    nav: '/workspace/portals/owner',
  },
  {
    id: 'guide-landlord-applications',
    match: exactPath('/workspace/portals/owner/applications'),
    roles: ['landlord'],
    title: 'Applications for your properties',
    intro: 'People who applied to rent your properties show here, with their documents and the agent’s checks.',
    bullets: [
      'See where each application is: new, vetting, approved, lease signed',
      'Approve or decline when your agent asks for your decision',
      'View and download supporting documents',
    ],
    search: 'Search by applicant or property to find one quickly.',
    list: 'Open an application to read the full details before you decide.',
    nav: '/workspace/portals/owner/applications',
  },
  {
    id: 'guide-landlord-properties',
    match: exactPath('/workspace/properties'),
    roles: ['landlord'],
    title: 'My properties',
    intro: 'All properties you own on Lekaya. Open one to check its listing, grade, documents and tenant.',
    actions: 'Add a property here. Your agency checks it before it is listed.',
    search: 'Search by name, suburb or unit.',
    list: 'Click a property to open its full record.',
    nav: '/workspace/properties',
  },
  {
    id: 'guide-landlord-property-detail',
    match: idPath('/workspace/properties'),
    roles: ['landlord'],
    title: 'Property record',
    intro: 'Everything about this property in one place.',
    bullets: ['Listing details and photos', 'Grade and how it was worked out', 'Documents, lease and tenant', 'Maintenance and payment history'],
    actions: 'Edit the property or download its documents from here.',
    tabs: 'Use the tabs to move between overview, documents, lease, maintenance and history.',
  },
  {
    id: 'guide-landlord-documents',
    match: exactPath('/workspace/operations/documents'),
    roles: ['landlord'],
    title: 'Documents',
    intro: 'Leases, inspection reports, statements and compliance certificates for your properties.',
    bullets: ['View any document in your browser', 'Download a copy for your records', 'Upload certificates your agent asks for'],
    search: 'Search by property, tenant or document type.',
    list: 'Use View to open a document and Download to keep a copy.',
    nav: '/workspace/operations/documents',
  },
  {
    id: 'guide-landlord-payments',
    match: exactPath('/workspace/operations/payments'),
    roles: ['landlord'],
    title: 'Payments',
    intro: 'Rent received, fees deducted and money paid out to you.',
    bullets: ['Each payment shows its status and date', 'Open a payment to see proof of payment and attachments', 'Unpaid rent is escalated to you and the agency'],
    search: 'Filter by property, month or status.',
    list: 'Open a payment for the full breakdown.',
    nav: '/workspace/operations/payments',
  },
  {
    id: 'guide-landlord-maintenance',
    match: exactPath('/workspace/operations/maintenance'),
    roles: ['landlord'],
    title: 'Maintenance',
    intro: 'Faults reported at your properties and how far each job is.',
    bullets: ['Approve quotes when your agent asks', 'See which contractor is booked and when', 'Overdue jobs are escalated automatically'],
    actions: 'Log a new fault here if you spot one yourself.',
    search: 'Filter by property, priority or status.',
    list: 'Open a job to see photos, quotes, updates and the invoice.',
    nav: '/workspace/operations/maintenance',
  },
  {
    id: 'guide-landlord-reports',
    match: exactPath('/workspace/insights/reports'),
    roles: ['landlord'],
    title: 'Reports',
    intro: 'Income, expenses and occupancy for your portfolio.',
    bullets: ['Choose a report and a date range', 'Download as PDF or spreadsheet for your accountant'],
    tabs: 'Pick the report you want from these tabs.',
    nav: '/workspace/insights/reports',
  },

  // ——— Contractor ———
  {
    id: 'guide-contractor-home',
    match: exactPath('/workspace/portals/contractor'),
    roles: ['contractor'],
    title: 'Your contractor dashboard',
    intro: 'Jobs assigned to you, bookings waiting for a reply and your verification status.',
    bullets: [
      'Accept or decline new bookings',
      'Update a job as you start and finish it',
      'Upload quotes, invoices and photos',
      'Keep your documents current so agencies can book you',
    ],
    actions: 'Shortcuts to your jobs, bookings and profile.',
    list: 'Your active jobs. Open one to see the address, the fault and who to contact.',
    nav: '/workspace/portals/contractor',
  },
  {
    id: 'guide-contractor-jobs',
    match: exactPath('/workspace/operations/maintenance'),
    roles: ['contractor'],
    title: 'My jobs',
    intro: 'Every maintenance job an agency has given you.',
    bullets: [
      'Open a job to see the fault, photos and access details',
      'Mark it started, add progress notes and photos',
      'Upload your quote or invoice and mark it done',
    ],
    search: 'Filter by status or priority to see what needs doing first.',
    list: 'Overdue jobs are flagged. Agencies can escalate jobs that pass their deadline.',
    nav: '/workspace/operations/maintenance',
  },
  {
    id: 'guide-contractor-job-detail',
    match: idPath('/workspace/operations/maintenance'),
    roles: ['contractor'],
    title: 'Job details',
    intro: 'All you need for this job: what is wrong, where, who to contact and the deadline.',
    bullets: ['Update the status as you work', 'Add notes and photos for the agent', 'Upload your quote and invoice'],
    actions: 'Use these buttons to update the job.',
  },
  {
    id: 'guide-contractor-bookings',
    match: exactPath('/workspace/portals/contractor/bookings'),
    roles: ['contractor'],
    title: 'Bookings',
    intro: 'Agencies book you here for a date and time. Reply quickly so they can plan.',
    bullets: ['Accept, decline or suggest another time', 'Accepted bookings show on your dashboard', 'Linked jobs open from the booking'],
    list: 'Each booking shows the agency, address, date and the job it belongs to.',
    nav: '/workspace/portals/contractor/bookings',
  },
  {
    id: 'guide-contractor-conduct',
    match: exactPath('/workspace/conduct'),
    roles: ['contractor'],
    title: 'Complaints & warnings',
    intro: 'Complaints and warnings about your work, and your replies.',
    bullets: ['Read what was raised and by whom', 'Reply with your side and attach evidence', 'Resolved items stay here for your record'],
    list: 'Open an item to respond.',
    nav: '/workspace/conduct',
  },

  // ——— Tenant (pages without a hand-written tour) ———
  {
    id: 'guide-tenant-enquiries',
    match: exactPath('/workspace/portals/tenant/enquiries'),
    roles: ['tenant'],
    title: 'My enquiries',
    intro: 'Questions you sent about listings, and the agents’ replies.',
    bullets: ['Reply to keep the conversation going', 'Book a viewing or apply straight from an enquiry'],
    list: 'Newest enquiries are at the top.',
    nav: '/workspace/portals/tenant/enquiries',
  },
  {
    id: 'guide-tenant-leases',
    match: exactPath('/workspace/portals/tenant/leases'),
    roles: ['tenant'],
    title: 'My lease',
    intro: 'Your lease agreement, its dates and the rent.',
    bullets: [
      'View and download the full lease',
      'Sign the lease electronically when it is sent to you',
      'See when the next rent increase is due',
    ],
    list: 'Open the lease to read every clause before you sign.',
    nav: '/workspace/portals/tenant/leases',
  },
  {
    id: 'guide-tenant-payments',
    match: exactPath('/workspace/portals/tenant/payments'),
    roles: ['tenant'],
    title: 'Payments',
    intro: 'Rent and other amounts due, and everything you have paid.',
    bullets: ['Pay online or upload proof of payment', 'Download receipts and statements', 'You are reminded before rent is due'],
    list: 'Each line shows the amount, due date and status.',
    nav: '/workspace/portals/tenant/payments',
  },
  {
    id: 'guide-tenant-application-detail',
    match: idPath('/workspace/portals/tenant/applications'),
    roles: ['tenant'],
    title: 'Your application',
    intro: 'Follow each step of this application, from documents to signing the lease.',
    bullets: [
      'Upload any documents that are still missing',
      'See what the agent is checking',
      'Accept the offer and sign the lease when it is ready',
    ],
    actions: 'The next thing you need to do is shown here.',
  },

  // ——— Staff pages without a hand-written tour ———
  {
    id: 'guide-staff-maintenance-detail',
    match: idPath('/workspace/operations/maintenance'),
    roles: [...STAFF, 'super_admin', 'landlord'],
    title: 'Maintenance job',
    intro: 'The full record of this job: the fault, photos, contractor, quotes, updates and cost.',
    bullets: ['Assign or change the contractor', 'Approve quotes and track progress', 'Escalate if it is stuck'],
    actions: 'Edit, assign, escalate or close the job from here.',
  },
  {
    id: 'guide-staff-maintenance-new',
    match: exactPath('/workspace/operations/maintenance/new'),
    roles: [...STAFF, 'super_admin', 'landlord', 'tenant'],
    title: 'Log a maintenance job',
    intro: 'Describe the fault so the right person can fix it fast.',
    form: 'Pick the property, describe the problem, set the priority and add photos. You can assign a contractor straight away.',
    formBullets: ['Urgent jobs are escalated sooner', 'Contractors not on your roster can be added as you assign them'],
  },
  {
    id: 'guide-staff-maintenance-edit',
    match: idPath('/workspace/operations/maintenance', '/edit'),
    roles: [...STAFF, 'super_admin'],
    title: 'Edit maintenance job',
    intro: 'Change the details, priority or contractor for this job.',
    form: 'Update what changed and save. Everyone on the job is told.',
  },
  {
    id: 'guide-staff-payment-detail',
    match: idPath('/workspace/operations/payments'),
    roles: [...STAFF, 'super_admin', 'landlord'],
    title: 'Payment details',
    intro: 'One payment: who paid, what it was for, and where the money went.',
    bullets: ['Record the payment or mark it unpaid', 'Attach proof of payment and invoices', 'Download a receipt'],
    actions: 'Record, allocate or download from here.',
  },
  {
    id: 'guide-staff-crm-detail',
    match: idPath('/workspace/sales/crm'),
    roles: [...STAFF, 'super_admin'],
    title: 'Lead',
    intro: 'Everything about this lead: contact details, interests, notes and activity.',
    bullets: ['Log calls and notes', 'Book a viewing', 'Move the lead along the pipeline'],
    actions: 'Contact, book or convert the lead from here.',
  },
  {
    id: 'guide-staff-application-detail',
    match: idPath('/workspace/sales/applications'),
    roles: [...STAFF, 'super_admin'],
    title: 'Application',
    intro: 'Work through this application step by step until the lease is signed.',
    bullets: [
      'Check identity, income and references',
      'Approve or decline with a reason',
      'Send the lease for signature by all parties',
      'View and download every document',
    ],
    actions: 'The next step for this application is shown here.',
    tabs: 'Move between details, documents, checks and lease.',
  },
  {
    id: 'guide-staff-inspection',
    match: idPath('/workspace/sales/applications', '/inspection'),
    roles: [...STAFF, 'super_admin'],
    title: 'Move-in inspection',
    intro: 'Record the condition of each room before the tenant moves in.',
    form: 'Go room by room, rate each item, add notes and photos. Both parties sign at the end.',
  },
  {
    id: 'guide-inspection-compare',
    match: idPath('/workspace/inspections', '/compare'),
    roles: [...STAFF, 'super_admin', 'landlord', 'tenant'],
    title: 'Compare inspections',
    intro: 'Move-in and move-out inspections side by side, so damage claims against the deposit are clear.',
    list: 'Rows with a change are highlighted.',
  },
  {
    id: 'guide-staff-viewings-property',
    match: idPath('/workspace/sales/viewings/property'),
    roles: [...STAFF, 'super_admin'],
    title: 'Viewings for this property',
    intro: 'All viewing slots and bookings for one property.',
    actions: 'Add viewing slots here.',
    list: 'Confirm, reschedule or cancel each booking. Attendees are told automatically.',
  },
  {
    id: 'guide-staff-property-edit',
    match: idPath('/workspace/properties', '/edit'),
    roles: [...STAFF, 'super_admin', 'landlord'],
    title: 'Edit property',
    intro: 'Every step of the property is open for editing. Save on any step.',
    form: 'Jump to the step you want, change it and save.',
  },
  {
    id: 'guide-staff-properties-archive',
    match: exactPath('/workspace/properties/archive'),
    roles: [...STAFF, 'super_admin'],
    title: 'Archived properties',
    intro: 'Properties taken off the books. Their history is kept.',
    list: 'Restore a property to make it active again.',
  },
  {
    id: 'guide-staff-asset-detail',
    match: idPath('/workspace/properties/assets'),
    roles: [...STAFF, 'super_admin', 'landlord'],
    title: 'Asset',
    intro: 'One item at the property, such as a geyser or a stove, with its service history and documents.',
  },
  {
    id: 'guide-staff-tenant-detail',
    match: idPath('/workspace/people/tenants'),
    roles: [...STAFF, 'super_admin'],
    title: 'Tenant profile',
    intro: 'This tenant’s lease, payments, maintenance requests, documents and messages.',
    actions: 'Message the tenant or open their lease from here.',
    tabs: 'Use the tabs to move between the tenant’s records.',
  },
  {
    id: 'guide-staff-staff-detail',
    match: idPath('/workspace/people/staff'),
    roles: [...AGENCY_ADMINS, 'super_admin'],
    title: 'Team member',
    intro: 'This person’s role, permissions, properties and activity.',
    actions: 'Change their role or permissions, or deactivate the account.',
  },
  {
    id: 'guide-conduct-staff',
    match: exactPath('/workspace/conduct'),
    roles: [...STAFF, 'super_admin', 'landlord', 'tenant'],
    title: 'Complaints & warnings',
    intro: 'Complaints and warnings raised about people on the platform, and the replies.',
    bullets: ['Raise a complaint with evidence', 'Issue a warning', 'Track each item to resolution'],
    actions: 'Raise a new complaint or warning here.',
    list: 'Open an item to read it and reply.',
  },

  // ——— Admin ———
  {
    id: 'guide-admin-home',
    match: exactPath('/workspace/admin'),
    roles: [...AGENCY_ADMINS, 'super_admin'],
    title: 'Admin',
    intro: 'Settings for your agency: users, roles, configuration and notifications.',
    list: 'Choose an area to manage.',
  },
  {
    id: 'guide-admin-users',
    match: exactPath('/workspace/admin/users'),
    roles: [...AGENCY_ADMINS, 'super_admin'],
    title: 'Users',
    intro: 'Everyone with a login at your agency.',
    bullets: ['Invite staff, landlords and contractors', 'Set each person’s role and permissions', 'Deactivate people who leave'],
    actions: 'Add a new user here. They get a welcome email to set up their account.',
    search: 'Search by name, email or role.',
    list: 'Open a user to change their access.',
  },
  {
    id: 'guide-admin-user-new',
    match: exactPath('/workspace/admin/users/new'),
    roles: [...AGENCY_ADMINS, 'super_admin'],
    title: 'Add a user',
    intro: 'Create an account and choose what the person can do.',
    form: 'Enter their details, pick a role and tick extra permissions. You can only give permissions up to your own level.',
    formBullets: ['They receive a welcome email and must verify their address', 'No password is ever sent by email'],
  },
  {
    id: 'guide-admin-user-detail',
    match: idPath('/workspace/admin/users'),
    roles: [...AGENCY_ADMINS, 'super_admin'],
    title: 'User',
    intro: 'Change this person’s role, permissions or status.',
    actions: 'Save changes, reset access or deactivate the account.',
  },
  {
    id: 'guide-admin-agency-new',
    match: exactPath('/workspace/admin/agencies/new'),
    roles: ['super_admin'],
    title: 'Add an agency',
    intro: 'Set up a new agency on the platform.',
    form: 'Enter the agency details, plan and first administrator. They receive a welcome email.',
  },
  {
    id: 'guide-admin-agency-detail',
    match: idPath('/workspace/admin/agencies'),
    roles: ['super_admin'],
    title: 'Agency',
    intro: 'This agency’s plan, billing, users, storage and status.',
    actions: 'Edit, suspend or open billing for the agency.',
    tabs: 'Move between the agency’s details.',
  },
  {
    id: 'guide-admin-reviews',
    match: exactPath('/workspace/admin/reviews'),
    roles: ['super_admin'],
    title: 'Review moderation',
    intro: 'Reviews that were reported or held for checking.',
    bullets: ['Publish reviews that follow the rules', 'Hide abusive or false reviews', 'Reply on behalf of Lekaya'],
    list: 'Open a review to moderate it.',
  },
  {
    id: 'guide-admin-inventory-templates',
    match: exactPath('/workspace/admin/inventory-templates'),
    roles: [...AGENCY_ADMINS, 'super_admin'],
    title: 'Inventory templates',
    intro: 'Room-by-room checklists used for move-in and move-out inspections.',
    actions: 'Create a template here.',
    list: 'Edit a template to change its rooms and items.',
  },
  {
    id: 'guide-admin-application-journey',
    match: exactPath('/workspace/admin/application-journey'),
    roles: [...AGENCY_ADMINS, 'super_admin'],
    title: 'Application journey',
    intro: 'Choose the steps every rental application goes through at your agency.',
    form: 'Turn steps on or off and set what documents applicants must upload.',
  },
  {
    id: 'guide-platform-billing-v2',
    match: exactPath('/workspace/platform/billing'),
    roles: ['super_admin'],
    title: 'Billing',
    intro: 'Every agency pays a monthly Lekaya subscription by portfolio size, plus R25 a month per advertised property.',
    bullets: [
      'Invoices are created on the 1st and fall due on the 7th',
      'Record payments with the bank slip or screenshot attached',
      'Unpaid invoices are escalated: agency admins first, then you',
    ],
    actions: 'Create this month’s invoices now if you do not want to wait for the automatic run.',
    tabs: 'Switch between invoices not paid yet and all invoices.',
    extra: [
      {
        title: 'Agencies',
        body: 'Each agency’s size, plan and next invoice. Use Settings for an agreed fee (1,000+ properties), to waive the sign-up fee or to stop billing an agency.',
        target: '[data-tip-target="billing-agencies"]',
        placement: 'above',
      },
    ],
    isNew: true,
  },
  {
    id: 'guide-agency-subscription',
    match: exactPath('/workspace/admin/subscription'),
    roles: [...AGENCY_ADMINS],
    title: 'Subscription & billing',
    intro: 'Your monthly Lekaya Rentals invoices and what you owe.',
    bullets: [
      'Pay by EFT with the invoice number as the reference',
      'Upload the proof of payment so we can confirm it',
      'View or download any invoice as a PDF',
    ],
    list: 'Each invoice shows its status. Unpaid ones past the due date are flagged.',
    nav: '/workspace/admin/subscription',
    isNew: true,
  },
  {
    id: 'guide-invoice',
    match: idPath('/workspace/billing/invoices'),
    roles: ['super_admin', ...AGENCY_ADMINS],
    title: 'Invoice',
    intro: 'The full tax invoice, payments received and any proof uploaded.',
    actions: 'Download it as a PDF, upload proof of payment, or (platform team) record the payment.',
  },

  // ——— Shared pages ———
  {
    id: 'guide-account-settings',
    match: exactPath('/workspace/account/settings'),
    roles: ALL_SIGNED_IN,
    title: 'Account settings',
    intro: 'Your profile, password, signature, notifications and page tips.',
    bullets: [
      'Choose which notifications and emails you receive',
      'Turn page tips on or off',
      'Change your password',
    ],
    extra: [
      {
        title: 'Notifications',
        body: 'Switch app alerts and emails on or off, or turn off single topics such as payments or viewings.',
        target: '[data-tip-target="notification-settings"]',
        placement: 'below',
        isNew: true,
      },
    ],
    nav: '/workspace/account/settings',
  },
  {
    id: 'guide-account-password',
    match: exactPath('/workspace/account/password'),
    roles: ALL_SIGNED_IN,
    title: 'Change password',
    intro: 'Pick a strong password you do not use anywhere else.',
    form: 'Enter your current password, then the new one twice.',
  },
  {
    id: 'guide-account-signature',
    match: exactPath('/workspace/account/signature'),
    roles: ALL_SIGNED_IN,
    title: 'Your signature',
    intro: 'Save your electronic signature once and use it to sign leases and inspections.',
    bullets: ['Draw or type your signature', 'Each signing still asks you to tick “I agree”'],
    form: 'Draw your signature and save.',
  },
  {
    id: 'guide-help',
    match: exactPath('/workspace/help'),
    roles: ALL_SIGNED_IN,
    title: 'Help & support',
    intro: 'Answers to common questions and a way to contact support.',
    bullets: ['Search the help articles', 'Log a support ticket and follow its progress'],
    search: 'Type a question to find an answer.',
    nav: '/workspace/help',
  },
  {
    id: 'guide-public-profile',
    match: (p) => /^\/workspace\/profile\/[^/]+$/.test(p) || /^\/profile\/[^/]+$/.test(p),
    roles: ALL_SIGNED_IN,
    title: 'Profile',
    intro: 'This person’s public profile: verification, reviews and track record.',
  },
]

/** Readable name for a path segment ("inventory-templates" → "Inventory templates"). */
function humanize(segment: string): string {
  const s = segment.replace(/[-_]+/g, ' ').trim()
  return s ? s[0].toUpperCase() + s.slice(1) : 'This page'
}

const ID_LIKE = /^(?:[0-9a-f]{8}-|[0-9]+$|[a-z]+_[a-z0-9]+$|[a-z0-9]{12,}$)/i

/** Last resort for any workspace page without its own tour. */
export function genericWorkspaceTour(pathname: string): PageTour | null {
  if (!pathname.startsWith('/workspace/')) return null
  const segments = pathname.split('/').filter(Boolean).slice(1)
  const named = segments.filter((s) => !ID_LIKE.test(s))
  const key = segments.map((s) => (ID_LIKE.test(s) ? 'id' : s)).join('-')
  const title = humanize(named[named.length - 1] ?? 'page')
  return {
    id: `guide-generic-${key}`,
    steps: [
      {
        title,
        body: 'The heading tells you what this page is for. The short line under it explains what you can do here.',
        target: HEADER,
        placement: 'below',
      },
      {
        title: 'Page actions',
        body: 'The main things you can do on this page are these buttons.',
        target: ACTIONS,
        placement: 'below',
      },
      { title: 'Switch views', body: 'Use the tabs to move between sections.', target: TABS, placement: 'below' },
      { title: 'Search and filter', body: 'Narrow the list to what you need.', target: SEARCH, placement: 'below' },
      {
        title: 'Need help?',
        body: 'Open Help & support from the menu at any time. You can switch page tips off in your account settings.',
        target: '[data-tip-nav="/workspace/help"] || [data-tip-target="workspace-nav"]',
        placement: 'below',
      },
    ],
  }
}

export function resolveGuideTour(pathname: string, role: Role | null): PageTour | null {
  if (!role) return null
  for (const g of PAGE_GUIDES) {
    if (g.roles.includes(role) && g.match(pathname)) return buildGuideTour(g)
  }
  return genericWorkspaceTour(pathname)
}
