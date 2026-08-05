import type { Role } from '../types/domain'

export type PageTipContent = {
  /** Stable id for per-user dismissal storage */
  id: string
  title: string
  body: string
}

export type PageTourStep = {
  title: string
  body: string
  /** CSS selector for spotlight + anchor; omit for centered welcome step */
  target?: string
  placement?: 'center' | 'above' | 'below'
}

export type PageTour = {
  id: string
  steps: PageTourStep[]
}

/** Multi-step walkthroughs (shown before single-step route tips). */
const WALKTHROUGH_RULES: Array<{
  match: (pathname: string) => boolean
  roles?: Role[]
  tour: (role: Role | null) => PageTour
}> = [
  {
    match: exact('/'),
    tour: () => ({
      id: 'tour-market-home',
      steps: [
        {
          title: 'Welcome to PropertyFlow',
          body: 'Browse buy, rent, and commercial listings across South Africa. This quick tour shows where to search, save favourites, and sign in when you are ready to apply.',
          placement: 'center',
        },
        {
          title: 'Buy & rent',
          body: 'Switch between sale and rental inventory — or explore commercial and bond calculators from the top navigation.',
          target: '[data-tip-target="market-nav"]',
          placement: 'below',
        },
        {
          title: 'Search by area',
          body: 'Enter a suburb, city, or keyword to jump straight into filtered results on the browse page.',
          target: '[data-tip-target="market-search"]',
          placement: 'below',
        },
        {
          title: 'Saved homes',
          body: 'Heart listings to keep them on your wishlist. Sign in to sync saves across devices.',
          target: '[data-tip-target="market-saved"]',
          placement: 'below',
        },
        {
          title: 'Apply when ready',
          body: 'Browsing is free — create an account only when you want to apply for a property or track an application.',
          target: '[data-tip-target="market-auth"]',
          placement: 'below',
        },
      ],
    }),
  },
  {
    match: prefix('/browse'),
    tour: () => ({
      id: 'tour-market-browse',
      steps: [
        {
          title: 'Refine your search',
          body: 'Use these tabs to switch between all listings, properties for sale, rentals, or commercial stock.',
          target: '[data-tip-target="browse-modes"]',
          placement: 'below',
        },
        {
          title: 'Filters & sort',
          body: 'Open filters for price, beds, amenities, and grading — then sort by featured, price, or newest.',
          target: '[data-tip-target="browse-filters"]',
          placement: 'below',
        },
        {
          title: 'Map view',
          body: 'Toggle the map to compare suburbs and spot clusters of available homes.',
          target: '[data-tip-target="browse-map"]',
          placement: 'below',
        },
        {
          title: 'Open a listing',
          body: 'Tap any card for photos, fees, and viewing slots. You only need an account when you apply.',
          placement: 'center',
        },
      ],
    }),
  },
  {
    match: exact('/workspace'),
    roles: ['client_admin', 'agent_admin', 'ground_agent', 'agent'],
    tour: (role) => ({
      id: 'tour-workspace-home',
      steps: [
        {
          title: role === 'ground_agent' || role === 'agent' ? 'Your day at a glance' : 'Agency command centre',
          body:
            role === 'ground_agent' || role === 'agent'
              ? 'Viewings, tickets, and follow-ups assigned to you surface here first.'
              : 'Start with the overview tab for items needing attention, then jump into properties, sales, or operations.',
          placement: 'center',
        },
        {
          title: 'Navigation',
          body: 'The sidebar groups properties, sales pipeline, operations, and people — only modules your role can access are shown.',
          target: '[data-tip-target="workspace-nav"]',
          placement: 'below',
        },
        {
          title: 'Quick search',
          body: 'Use spotlight search to jump to a property, lead, tenant, or page anywhere in the workspace.',
          target: '[data-tip-target="workspace-search"]',
          placement: 'below',
        },
      ],
    }),
  },
  {
    match: exact('/workspace/properties/new'),
    tour: () => ({
      id: 'tour-property-create',
      steps: [
        {
          title: 'Add a property',
          body: 'This wizard walks you through building, unit, and listing details in order. You can save a draft at any time and publish when ready.',
          placement: 'center',
        },
        {
          title: 'Step-by-step progress',
          body: 'Each step unlocks the next. Click a completed step in the sidebar to jump back and edit without losing your work.',
          target: '[data-tip-target="wizard-steps"]',
          placement: 'below',
        },
        {
          title: 'Guidance for this step',
          body: 'The panel on the left explains what the current step needs. It updates as you move through type, location, rooms, media, and pricing.',
          target: '[data-tip-target="wizard-step-tip"]',
          placement: 'below',
        },
        {
          title: 'Live preview',
          body: 'See how your listing will look on the marketplace as you fill in photos, pricing, and title.',
          target: '[data-tip-target="wizard-preview"]',
          placement: 'below',
        },
        {
          title: 'Need help on a field?',
          body: 'Look for the ? icons next to labels — tap them for quick explanations of what to enter. Use Continue when each step is complete.',
          target: '[data-tip-target="wizard-form"]',
          placement: 'below',
        },
      ],
    }),
  },
]

export function resolvePageTour(pathname: string, role: Role | null): PageTour | null {
  const normalized = pathname.replace(/\/+$/, '') || '/'

  for (const rule of WALKTHROUGH_RULES) {
    if (!rule.match(normalized)) continue
    if (rule.roles && (!role || !rule.roles.includes(role))) continue
    return rule.tour(role)
  }

  return null
}

type TipRule = {
  match: (pathname: string) => boolean
  /** When set, only these roles see this tip (others get no tip for this route). */
  roles?: Role[]
  content: (role: Role | null) => PageTipContent
}

function exact(path: string) {
  return (pathname: string) => pathname === path
}

function prefix(path: string) {
  return (pathname: string) => pathname === path || pathname.startsWith(`${path}/`)
}

function detailSegment(path: string, _segment: string) {
  const re = new RegExp(`^${path.replace(/\//g, '\\/')}/[^/]+$`)
  return (pathname: string) => re.test(pathname) && !pathname.endsWith('/new')
}

const RULES: TipRule[] = [
  // —— Marketplace ——
  {
    match: exact('/'),
    content: () => ({
      id: 'market-home',
      title: 'Welcome to PropertyFlow',
      body: 'Search by area to browse buy, rent, and commercial listings. Save favourites when signed in, or open Calculators to estimate bond costs.',
    }),
  },
  {
    match: prefix('/browse'),
    content: () => ({
      id: 'market-browse',
      title: 'Refine your search',
      body: 'Switch between buy, rent, and commercial modes, then filter by price, beds, and property type. Map view helps compare neighbourhoods at a glance.',
    }),
  },
  {
    match: (p) => /^\/listing\/[^/]+$/.test(p),
    content: () => ({
      id: 'market-listing',
      title: 'Listing details',
      body: 'Review photos, features, and location before booking a viewing. Use the heart icon to save listings to your wishlist when signed in.',
    }),
  },
  {
    match: exact('/saved'),
    content: () => ({
      id: 'market-saved',
      title: 'Your saved listings',
      body: 'Listings you heart while browsing appear here. Sign in to keep them across devices and apply from your tenant portal.',
    }),
  },
  {
    match: prefix('/calculators'),
    content: () => ({
      id: 'market-calculators',
      title: 'Plan your purchase',
      body: 'Run affordability, bond, and transfer-cost estimates before you apply. Results are indicative — share them with your agent or bank.',
    }),
  },

  // —— Workspace dashboard ——
  {
    match: exact('/workspace'),
    roles: ['client_admin', 'agent_admin'],
    content: () => ({
      id: 'dashboard-agency',
      title: 'Your agency command centre',
      body: 'The overview tab surfaces items needing attention today. Switch tabs for properties, viewings, maintenance, and applications — or use Create to add something new.',
    }),
  },
  {
    match: exact('/workspace'),
    roles: ['ground_agent', 'agent'],
    content: () => ({
      id: 'dashboard-field',
      title: 'Your day at a glance',
      body: 'Viewings, tickets, and follow-ups assigned to you appear here. Tap any row to open details and update status on the go.',
    }),
  },

  // —— Properties ——
  {
    match: exact('/workspace/properties'),
    content: () => ({
      id: 'properties-list',
      title: 'Property portfolio',
      body: 'Switch between list, card, and map views. Filter by status or listing mode, then open a property to manage photos, tenants, and documents.',
    }),
  },
  {
    match: exact('/workspace/properties/new'),
    content: () => ({
      id: 'properties-create',
      title: 'Add a property',
      body: 'Complete each step — location, details, and media — before publishing. Drafts stay private until you mark the listing live.',
    }),
  },
  {
    match: detailSegment('/workspace/properties', 'id'),
    content: () => ({
      id: 'property-detail',
      title: 'Property workspace',
      body: 'Use the tabs to manage overview, applicants, maintenance, payments, and documents without leaving this page.',
    }),
  },

  // —— Sales ——
  {
    match: exact('/workspace/sales/crm'),
    content: () => ({
      id: 'sales-crm',
      title: 'Lead pipeline',
      body: 'Toggle board or list view to track enquiry stages. Open a lead to log calls, schedule follow-ups, and link them to a property.',
    }),
  },
  {
    match: detailSegment('/workspace/sales/crm', 'id'),
    content: () => ({
      id: 'lead-detail',
      title: 'Lead record',
      body: 'Timeline entries capture every touchpoint. Update stage and assign an agent so nothing slips through the cracks.',
    }),
  },
  {
    match: exact('/workspace/sales/applications'),
    content: () => ({
      id: 'sales-applications',
      title: 'Rental applications',
      body: 'Review incoming applicants, run checks, and move promising ones forward. Blocked applicants are hidden from new submissions.',
    }),
  },
  {
    match: detailSegment('/workspace/sales/applications', 'id'),
    content: () => ({
      id: 'applicant-detail',
      title: 'Applicant review',
      body: 'Verify employment, references, and ID before approving. Use the history tab to see every status change.',
    }),
  },
  {
    match: exact('/workspace/sales/viewings'),
    content: () => ({
      id: 'sales-viewings',
      title: 'Viewing schedule',
      body: 'Day strip and calendar views show upcoming appointments. Create a viewing to invite guests and link it to the listing.',
    }),
  },
  {
    match: prefix('/workspace/sales/viewings/property'),
    content: () => ({
      id: 'viewings-property',
      title: 'Property viewings',
      body: 'All scheduled and past viewings for this address appear here. Add notes after each visit to inform the owner.',
    }),
  },

  // —— Operations ——
  {
    match: exact('/workspace/operations/maintenance'),
    content: () => ({
      id: 'ops-maintenance',
      title: 'Maintenance queue',
      body: 'Filter by priority or status to triage open tickets. Assign a contractor and track photos until the job is marked complete.',
    }),
  },
  {
    match: detailSegment('/workspace/operations/maintenance', 'id'),
    content: () => ({
      id: 'maintenance-detail',
      title: 'Ticket details',
      body: 'Log updates, attach photos, and change priority as the situation evolves. Tenants see status changes in their portal.',
    }),
  },
  {
    match: exact('/workspace/operations/documents'),
    content: () => ({
      id: 'ops-documents',
      title: 'Document library',
      body: 'Leases, FICA, and compliance files live here. Filter by property or type, and approve pending uploads from tenants or owners.',
    }),
  },
  {
    match: exact('/workspace/operations/communications'),
    content: () => ({
      id: 'ops-communications',
      title: 'Messages hub',
      body: 'Send SMS or email to tenants, owners, or leads. Templates save time for rent reminders and viewing confirmations.',
    }),
  },
  {
    match: exact('/workspace/operations/payments'),
    content: () => ({
      id: 'ops-payments',
      title: 'Rent & payments',
      body: 'Track due, overdue, and settled amounts across your portfolio. Open a payment to attach proof or mark it paid.',
    }),
  },
  {
    match: detailSegment('/workspace/operations/payments', 'id'),
    content: () => ({
      id: 'payment-detail',
      title: 'Payment record',
      body: 'Confirm amount, period, and tenant before recording settlement. Attach bank proof for audit trails.',
    }),
  },

  // —— Portals ——
  {
    match: exact('/workspace/portals/owner'),
    roles: ['landlord'],
    content: () => ({
      id: 'portal-owner',
      title: 'Owner portfolio',
      body: 'See occupancy, rent collected, and open maintenance across your properties. Messages from your agency appear in the overview.',
    }),
  },
  {
    match: exact('/workspace/portals/tenant'),
    roles: ['tenant'],
    content: () => ({
      id: 'portal-tenant-home',
      title: 'Your tenancy hub',
      body: 'Check rent due, lease dates, and quick links to maintenance and messages. Saved listings live under Wishlist in the sidebar.',
    }),
  },
  {
    match: exact('/workspace/portals/tenant/applications'),
    roles: ['tenant'],
    content: () => ({
      id: 'portal-tenant-applications',
      title: 'Your applications',
      body: 'Track each rental application from submission to decision. Upload any missing documents when an agent requests them.',
    }),
  },
  {
    match: exact('/workspace/portals/tenant/maintenance'),
    roles: ['tenant'],
    content: () => ({
      id: 'portal-tenant-maintenance',
      title: 'Report an issue',
      body: 'Log maintenance requests with photos and urgency. You will see status updates here as your agency or contractor progresses the job.',
    }),
  },
  {
    match: exact('/workspace/portals/tenant/messages'),
    roles: ['tenant'],
    content: () => ({
      id: 'portal-tenant-messages',
      title: 'Messages',
      body: 'Conversation history with your agency stays in one place. Reply here instead of chasing email threads.',
    }),
  },
  {
    match: exact('/workspace/portals/tenant/complaints'),
    roles: ['tenant'],
    content: () => ({
      id: 'portal-tenant-complaints',
      title: 'Complaints',
      body: 'Escalate serious issues formally so they are tracked and resolved. Include dates and details for a faster response.',
    }),
  },
  {
    match: exact('/workspace/account/wishlist'),
    roles: ['tenant'],
    content: () => ({
      id: 'account-wishlist',
      title: 'Saved listings',
      body: 'Properties you hearted while browsing appear here. Apply directly or remove listings you are no longer considering.',
    }),
  },
  {
    match: exact('/workspace/portals/contractor'),
    roles: ['contractor'],
    content: () => ({
      id: 'portal-contractor',
      title: 'Your job board',
      body: 'Assigned maintenance tickets show address, priority, and access notes. Mark jobs complete and upload after photos when finished.',
    }),
  },

  // —— People ——
  {
    match: exact('/workspace/people/staff'),
    content: () => ({
      id: 'people-staff',
      title: 'Team directory',
      body: 'Browse agents and admins in your agency. Open a profile to adjust permissions, workload, or contact details.',
    }),
  },
  {
    match: detailSegment('/workspace/people/staff', 'id'),
    content: () => ({
      id: 'staff-detail',
      title: 'Team member profile',
      body: 'Review assigned properties, open tasks, and permission overrides. Changes here affect what this person can see in the workspace.',
    }),
  },
  {
    match: exact('/workspace/people/tenants'),
    content: () => ({
      id: 'people-tenants',
      title: 'Tenant directory',
      body: 'Search occupants by name, property, or lease status. Open a record for payment history, documents, and portal access.',
    }),
  },
  {
    match: detailSegment('/workspace/people/tenants', 'id'),
    content: () => ({
      id: 'tenant-detail',
      title: 'Tenant record',
      body: 'Lease terms, payment standing, and maintenance history are grouped by tab. Use this view before calling or emailing a tenant.',
    }),
  },

  // —— Insights & admin ——
  {
    match: exact('/workspace/insights/reports'),
    content: () => ({
      id: 'insights-reports',
      title: 'Reports & analytics',
      body: 'Switch report types to see occupancy, collections, and pipeline trends. Adjust the date range before exporting or sharing.',
    }),
  },
  {
    match: exact('/workspace/admin'),
    content: () => ({
      id: 'admin-hub',
      title: 'Administration',
      body: 'Shortcuts to users, configuration, and notifications. Only sections your role allows appear in the sidebar.',
    }),
  },
  {
    match: exact('/workspace/admin/users'),
    content: () => ({
      id: 'admin-users',
      title: 'User management',
      body: 'Create staff, assign roles, and enable agency modules per person. Search by name or filter by role to find someone quickly.',
    }),
  },
  {
    match: exact('/workspace/admin/users/new'),
    content: () => ({
      id: 'admin-user-create',
      title: 'Invite a user',
      body: 'Pick a role template, then fine-tune permissions. Preview shows which sidebar items they will see before you save.',
    }),
  },
  {
    match: detailSegment('/workspace/admin/users', 'id'),
    content: () => ({
      id: 'admin-user-detail',
      title: 'User profile',
      body: 'Update contact info, verification status, and permission overrides. Deactivate accounts instead of deleting to preserve history.',
    }),
  },
  {
    match: exact('/workspace/admin/agencies'),
    roles: ['super_admin'],
    content: () => ({
      id: 'admin-agencies',
      title: 'Agency management',
      body: 'Each agency has its own data boundary. Open an agency to configure modules, billing, and principal contacts.',
    }),
  },
  {
    match: exact('/workspace/admin/agencies/new'),
    roles: ['super_admin'],
    content: () => ({
      id: 'admin-agency-create',
      title: 'Onboard an agency',
      body: 'Set the agency name, region, and enabled modules. The principal admin receives workspace access once the record is saved.',
    }),
  },
  {
    match: detailSegment('/workspace/admin/agencies', 'id'),
    roles: ['super_admin'],
    content: () => ({
      id: 'admin-agency-detail',
      title: 'Agency settings',
      body: 'Toggle modules, review staff, and inspect capability checklists. Changes apply to all users under this agency.',
    }),
  },
  {
    match: exact('/workspace/admin/config'),
    content: () => ({
      id: 'admin-config',
      title: 'Configuration',
      body: 'Manage lookup values, property features, and agency-wide defaults. Edits here flow through to forms across the workspace.',
    }),
  },
  {
    match: exact('/workspace/admin/notifications'),
    content: () => ({
      id: 'admin-notifications',
      title: 'Broadcast notifications',
      body: 'Send announcements to roles or entire agencies. Schedule delivery and preview message text before sending.',
    }),
  },
  {
    match: exact('/workspace/admin/suite-alerts'),
    content: () => ({
      id: 'admin-suite-alerts',
      title: 'Suite alerts',
      body: 'Configure system-wide banners shown to users at login. Use sparingly for maintenance windows or policy updates.',
    }),
  },
  {
    match: exact('/workspace/platform/billing'),
    roles: ['super_admin'],
    content: () => ({
      id: 'platform-billing',
      title: 'Platform billing',
      body: 'Review subscription status and invoice history per agency. Contact finance before changing plan tiers in production.',
    }),
  },
]

/**
 * Resolve the first-visit tip for a pathname and optional role.
 * Role-gated rules only match when the user's role is listed.
 */
export function resolvePageTip(pathname: string, role: Role | null): PageTipContent | null {
  const normalized = pathname.replace(/\/+$/, '') || '/'

  for (const rule of RULES) {
    if (!rule.match(normalized)) continue
    if (rule.roles && (!role || !rule.roles.includes(role))) continue
    return rule.content(role)
  }

  return null
}

const STORAGE_KEY = 'pf-page-tips-v2'
const PREFS_KEY = 'pf-page-tips-prefs-v1'
const SESSION_COOLDOWN_KEY = 'pf-page-tips-cooldown'
/** Minimum gap between walkthroughs in the same browser session. */
export const TOUR_SESSION_COOLDOWN_MS = 20 * 60 * 1000

type SeenMap = Record<string, string[]>
type TipsPrefs = { disabled: boolean; decidedAt: string }
type PrefsMap = Record<string, TipsPrefs>

const memorySeen = new Map<string, SeenMap>()
const memoryPrefs = new Map<string, PrefsMap>()
let memoryCooldownAt: number | null = null

function readSeenMap(): SeenMap {
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as SeenMap
        return parsed && typeof parsed === 'object' ? parsed : {}
      }
    } catch {
      /* fall through to memory */
    }
  }
  return memorySeen.get(STORAGE_KEY) ?? {}
}

function writeSeenMap(map: SeenMap) {
  memorySeen.set(STORAGE_KEY, map)
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    /* memory already updated */
  }
}

export function hasSeenPageTip(userId: string, tipId: string): boolean {
  if (!userId) return true
  const map = readSeenMap()
  return map[userId]?.includes(tipId) ?? false
}

export function markPageTipSeen(userId: string, tipId: string): void {
  if (!userId) return
  const map = readSeenMap()
  const seen = map[userId] ?? []
  if (seen.includes(tipId)) return
  map[userId] = [...seen, tipId]
  writeSeenMap(map)
  markTourSessionCooldown()
}

function readPrefsMap(): PrefsMap {
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(PREFS_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as PrefsMap
        return parsed && typeof parsed === 'object' ? parsed : {}
      }
    } catch {
      /* fall through */
    }
  }
  return memoryPrefs.get(PREFS_KEY) ?? {}
}

function writePrefsMap(map: PrefsMap) {
  memoryPrefs.set(PREFS_KEY, map)
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(map))
  } catch {
    /* memory already updated */
  }
}

export function hasPageTipsPreference(userId: string): boolean {
  if (!userId || userId === 'anon') return true
  return Boolean(readPrefsMap()[userId])
}

export function arePageTipsDisabled(userId: string): boolean {
  if (!userId) return true
  return readPrefsMap()[userId]?.disabled === true
}

export function setPageTipsPreference(userId: string, disabled: boolean): void {
  if (!userId || userId === 'anon') return
  const map = readPrefsMap()
  map[userId] = { disabled, decidedAt: new Date().toISOString() }
  writePrefsMap(map)
}

export function markTourSessionCooldown(): void {
  memoryCooldownAt = Date.now()
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(SESSION_COOLDOWN_KEY, String(memoryCooldownAt))
  } catch {
    /* ignore */
  }
}

export function isTourSessionCooldownActive(
  cooldownMs = TOUR_SESSION_COOLDOWN_MS,
): boolean {
  let ts = memoryCooldownAt
  if (typeof sessionStorage !== 'undefined') {
    try {
      const raw = sessionStorage.getItem(SESSION_COOLDOWN_KEY)
      if (raw) ts = Number(raw)
    } catch {
      /* use memory */
    }
  }
  if (ts == null || !Number.isFinite(ts)) return false
  memoryCooldownAt = ts
  return Date.now() - ts < cooldownMs
}

/** Test helper — clears preference for a user. */
export function clearPageTipsPreference(userId: string): void {
  const map = readPrefsMap()
  delete map[userId]
  writePrefsMap(map)
}

/** Test helper — clears stored tips for a user. */
export function clearPageTipsForUser(userId: string): void {
  const map = readSeenMap()
  delete map[userId]
  writeSeenMap(map)
}

/** Test helper — clears all stored tips. */
export function clearAllPageTips(): void {
  memorySeen.delete(STORAGE_KEY)
  memoryPrefs.delete(PREFS_KEY)
  memoryCooldownAt = null
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(STORAGE_KEY)
      localStorage.removeItem(PREFS_KEY)
    } catch {
      /* ignore */
    }
  }
  if (typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.removeItem(SESSION_COOLDOWN_KEY)
    } catch {
      /* ignore */
    }
  }
}
