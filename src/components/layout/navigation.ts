import type { LucideIcon } from 'lucide-react'
import {
  Banknote,
  CalendarClock,
  Flag,
  LifeBuoy,
  Siren,
  Star,
  HardDrive,
  BookOpen,
  MessageSquareText,
  Building2,
  Clock,
  Inbox,
  Lock,
  CalendarDays,
  Calculator,
  ClipboardList,
  CreditCard,
  Eye,
  FileText,
  HardHat,
  Heart,
  Home,
  LayoutDashboard,
  Settings,
  Users,
  Wrench,
  BarChart3,
  Briefcase,
  KeyRound,
  FileSignature,
  Landmark,
  GitBranch,
  Bell,
  Mail,
  MessageSquare,
  AlertTriangle,
  MessageCircle,
  ShieldCheck,
  Wallet,
  ScrollText,
} from 'lucide-react'
import type { Permission } from '../../types/domain'
import { ACCOUNT_WISHLIST_PATH } from '../../lib/accountRoutes'

export type FlatNavItem = {
  to: string
  label: string
  end?: boolean
  permission?: Permission
  anyOf?: Permission[]
  icon: LucideIcon
  section?: string
}

export type NavGroup = {
  id: string
  label: string
  icon: LucideIcon
  children: FlatNavItem[]
}

export type WorkspaceNavEntry =
  | { type: 'link'; item: FlatNavItem }
  | { type: 'group'; group: NavGroup }

function canAccessItem(
  item: FlatNavItem,
  has: (p: Permission) => boolean,
  hasAny: (p: Permission[]) => boolean,
) {
  if (item.permission) return has(item.permission)
  if (item.anyOf) return hasAny(item.anyOf)
  return true
}

/**
 * Shared workspace nav tree. Groups stay; each link only appears when the
 * user’s effective permissions allow it (role ∩ agency modules ∩ overrides).
 * Portal links are for landlords / tenants / contractors — not staff or Super Admin.
 */
export function getWorkspaceNav(): WorkspaceNavEntry[] {
  return [
    { type: 'link', item: { to: '/workspace', label: 'Dashboard', end: true, icon: LayoutDashboard } },
    {
      type: 'group',
      group: {
        id: 'properties',
        label: 'Properties',
        icon: Building2,
        children: [
          {
            to: '/workspace/properties',
            label: 'All properties',
            anyOf: ['assets.view', 'listings.publish'],
            icon: Building2,
          },
        ],
      },
    },
    {
      type: 'group',
      group: {
        id: 'sales',
        label: 'Sales',
        icon: Briefcase,
        children: [
          {
            to: '/workspace/sales/viewings',
            label: 'Viewings',
            permission: 'viewings.manage',
            icon: Eye,
          },
          {
            to: '/workspace/sales/crm',
            label: 'Leads',
            anyOf: ['leads.view', 'leads.manage'],
            icon: Briefcase,
          },
          {
            to: '/workspace/sales/applications',
            label: 'Applicants',
            permission: 'applications.view',
            icon: ClipboardList,
          },
        ],
      },
    },
    {
      type: 'group',
      group: {
        id: 'operations',
        label: 'Operations',
        icon: Wrench,
        children: [
          {
            to: '/workspace/operations/maintenance',
            label: 'Maintenance',
            permission: 'maintenance.view',
            icon: Wrench,
          },
          {
            to: '/workspace/operations/escalations',
            label: 'Escalations',
            permission: 'escalations.view',
            icon: Siren,
          },
          {
            to: '/workspace/operations/payments',
            label: 'Payments',
            permission: 'payments.view',
            icon: CreditCard,
          },
          {
            to: '/workspace/operations/documents',
            label: 'Documents',
            permission: 'documents.view',
            icon: FileText,
          },
          {
            to: '/workspace/operations/communications',
            label: 'Messages',
            permission: 'messages.manage',
            icon: MessageSquare,
          },
        ],
      },
    },
    {
      type: 'group',
      group: {
        id: 'trust',
        label: 'Trust & Banking',
        icon: Wallet,
        // Follows the money: overview → every movement → match receipts →
        // chase arrears → deposits held → payouts out.
        children: [
          {
            to: '/workspace/trust',
            label: 'Overview',
            permission: 'trust.view',
            icon: LayoutDashboard,
            end: true,
          },
          {
            to: '/workspace/trust/cashbook',
            label: 'Cashbook',
            permission: 'trust.view',
            icon: BookOpen,
          },
          {
            to: '/workspace/trust/unallocated',
            label: 'Unallocated',
            permission: 'trust.allocate',
            icon: Inbox,
          },
          {
            to: '/workspace/trust/arrears',
            label: 'Arrears',
            anyOf: ['trust.view', 'trust.view_arrears'],
            icon: Clock,
          },
          {
            to: '/workspace/trust/deposits',
            label: 'Deposits',
            permission: 'trust.view',
            icon: Lock,
          },
          {
            to: '/workspace/trust/payouts',
            label: 'Payouts',
            permission: 'trust.approve_payout',
            icon: Banknote,
          },
        ],
      },
    },
    {
      type: 'link',
      item: {
        to: '/workspace/compliance',
        label: 'Compliance',
        permission: 'compliance.view',
        icon: ShieldCheck,
      },
    },
    {
      type: 'group',
      group: {
        id: 'people',
        label: 'People',
        icon: Users,
        children: [
          {
            to: '/workspace/people/staff',
            label: 'Team',
            permission: 'users.manage',
            icon: Briefcase,
          },
          {
            to: '/workspace/people/tenants',
            label: 'Tenants',
            permission: 'occupants.view',
            icon: KeyRound,
          },
          {
            to: '/workspace/people/leases',
            label: 'Leases',
            permission: 'occupants.view',
            icon: FileSignature,
          },
          {
            to: '/workspace/people/landlords',
            label: 'Landlords',
            anyOf: ['users.manage', 'assets.manage'],
            icon: KeyRound,
          },
          {
            to: '/workspace/operations/contractors',
            label: 'Contractors',
            permission: 'contractors.view',
            icon: HardHat,
          },
        ],
      },
    },
    {
      type: 'link',
      item: {
        to: '/workspace/admin/agencies',
        label: 'Agencies',
        permission: 'platform.manage',
        icon: Landmark,
      },
    },
    {
      type: 'link',
      item: {
        to: '/workspace/admin/storage',
        label: 'Storage',
        permission: 'platform.manage',
        icon: HardDrive,
      },
    },
    {
      type: 'group',
      group: {
        id: 'portals',
        label: 'My portal',
        icon: Home,
        children: [
          {
            to: '/workspace/portals/owner',
            label: 'My portfolio',
            permission: 'portal.owner',
            icon: KeyRound,
          },
          {
            to: '/workspace/portals/tenant',
            label: 'My tenancy',
            permission: 'portal.tenant',
            icon: Home,
          },
          {
            to: '/workspace/portals/tenant/applications',
            label: 'My applications',
            permission: 'portal.tenant',
            icon: ClipboardList,
          },
          {
            to: '/workspace/portals/tenant/viewings',
            label: 'Viewings',
            permission: 'portal.tenant',
            icon: CalendarDays,
          },
          {
            to: '/workspace/portals/tenant/enquiries',
            label: 'My enquiries',
            permission: 'portal.tenant',
            icon: MessageSquareText,
          },
          {
            to: ACCOUNT_WISHLIST_PATH,
            label: 'Wishlist',
            permission: 'portal.tenant',
            icon: Heart,
          },
          {
            to: '/workspace/portals/contractor',
            label: 'My jobs',
            permission: 'portal.contractor',
            icon: HardHat,
          },
        ],
      },
    },
    {
      type: 'group',
      group: {
        id: 'admin',
        label: 'Admin',
        icon: Settings,
        children: [
          {
            to: '/workspace/admin/config',
            label: 'Configuration',
            anyOf: ['config.manage', 'tenant.manage', 'platform.manage'],
            icon: Settings,
          },
          {
            to: '/workspace/admin/reviews',
            label: 'Reviews',
            // Moderation (hide / unhide) is super admin only.
            anyOf: ['platform.manage'],
            icon: Star,
          },
          {
            to: '/workspace/admin/pipeline',
            label: 'Lead pipeline',
            anyOf: ['config.manage', 'tenant.manage', 'platform.manage'],
            icon: GitBranch,
          },
          {
            to: '/workspace/admin/inventory-templates',
            label: 'Inventory templates',
            anyOf: ['config.manage', 'tenant.manage', 'platform.manage'],
            icon: ClipboardList,
          },
          {
            to: '/workspace/admin/notifications',
            label: 'Notifications',
            anyOf: ['notifications.broadcast', 'platform.manage'],
            icon: Bell,
          },
          {
            to: '/workspace/admin/subscription',
            label: 'Subscription & billing',
            permission: 'billing.view',
            icon: CreditCard,
          },
          {
            to: '/workspace/admin/emails',
            label: 'Emails',
            permission: 'platform.manage',
            icon: Mail,
          },
          {
            to: '/workspace/admin/all-users',
            label: 'All users',
            permission: 'platform.manage',
            icon: Users,
          },
          {
            to: '/workspace/platform/billing',
            label: 'Billing',
            permission: 'platform.manage',
            icon: CreditCard,
          },
        ],
      },
    },
    {
      type: 'link',
      item: {
        to: '/workspace/insights/reports',
        label: 'Reports',
        permission: 'reports.view',
        icon: BarChart3,
      },
    },
  ]
}

/** When visible links ≤ this count, show a flat sidebar (no collapsible groups). */
export const NAV_SMART_FLATTEN_MAX = 10

/** Groups that stay as menus when the nav is large enough to warrant grouping. */
const KEEP_GROUPED = new Set(['admin', 'portals', 'sales', 'operations', 'people', 'trust'])

export function flattenAllNavGroups(entries: WorkspaceNavEntry[]): WorkspaceNavEntry[] {
  return entries.flatMap((entry) => {
    if (entry.type === 'link') return [entry]
    return entry.group.children.map((child) => ({
      type: 'link' as const,
      item: child,
    }))
  })
}

export function findActiveNavGroupId(
  entries: WorkspaceNavEntry[],
  pathname: string,
): string | null {
  for (const entry of entries) {
    if (entry.type !== 'group') continue
    if (entry.group.children.some((c) => pathMatches(pathname, c.to, c.end))) {
      return entry.group.id
    }
  }
  return null
}

export function findActiveNavLink(
  entries: WorkspaceNavEntry[],
  pathname: string,
): FlatNavItem | null {
  return (
    flattenNavLinks(entries).find((item) => pathMatches(pathname, item.to, item.end)) ?? null
  )
}

export function navItemPath(item: Pick<FlatNavItem, 'to'>): string {
  return item.to.split('?')[0]
}

/** Drop duplicate destinations — first label wins (sidebar order). */
export function dedupeNavEntries(entries: WorkspaceNavEntry[]): WorkspaceNavEntry[] {
  const seen = new Set<string>()
  const result: WorkspaceNavEntry[] = []

  for (const entry of entries) {
    if (entry.type === 'link') {
      // Full `to` (query included) so Reports tab links are not folded into Reports.
      const key = entry.item.to
      if (seen.has(key)) continue
      seen.add(key)
      result.push(entry)
      continue
    }

    const children = entry.group.children.filter((child) => {
      const key = navItemPath(child)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    if (children.length === 0) continue
    result.push({ type: 'group', group: { ...entry.group, children } })
  }

  return result
}

/** Tenant-facing portal routes — hidden for contractors and landlords. */
export const TENANT_PORTAL_PATHS = new Set([
  '/workspace/portals/tenant',
  '/workspace/portals/tenant/applications',
  '/workspace/portals/tenant/viewings',
  '/workspace/portals/tenant/enquiries',
  ACCOUNT_WISHLIST_PATH,
  '/workspace/portals/tenant/maintenance',
  '/workspace/portals/tenant/messages',
  '/workspace/portals/tenant/complaints',
  '/workspace/portals/tenant/leases',
  '/workspace/portals/tenant/payments',
])

export const CONTRACTOR_PORTAL_PATHS = new Set(['/workspace/portals/contractor'])

export const OWNER_PORTAL_PATHS = new Set(['/workspace/portals/owner'])

export function foreignPortalPathsForRole(role: string): Set<string> {
  if (role === 'contractor') return new Set([...TENANT_PORTAL_PATHS, ...OWNER_PORTAL_PATHS])
  if (role === 'landlord') return new Set([...TENANT_PORTAL_PATHS, ...CONTRACTOR_PORTAL_PATHS])
  if (role === 'tenant') return new Set([...OWNER_PORTAL_PATHS, ...CONTRACTOR_PORTAL_PATHS])
  return new Set<string>()
}

/** Field agents: no agency-wide trust, compliance, people, admin, or reports. */
const FIELD_AGENT_HIDDEN_PREFIXES = [
  '/workspace/trust',
  '/workspace/compliance',
  '/workspace/people',
  '/workspace/admin',
  '/workspace/insights/reports',
  '/workspace/platform',
]

function pathHiddenByPrefixes(path: string, prefixes: readonly string[]): boolean {
  return prefixes.some((p) => path === p || path.startsWith(`${p}/`) || path.startsWith(`${p}?`))
}

export function stripNavByPathPrefixes(
  entries: WorkspaceNavEntry[],
  prefixes: readonly string[],
): WorkspaceNavEntry[] {
  const result: WorkspaceNavEntry[] = []
  for (const entry of entries) {
    if (entry.type === 'link') {
      const path = navItemPath(entry.item)
      const full = entry.item.to
      if (pathHiddenByPrefixes(path, prefixes) || pathHiddenByPrefixes(full, prefixes)) continue
      result.push(entry)
      continue
    }
    const children = entry.group.children.filter((c) => {
      const path = navItemPath(c)
      return !pathHiddenByPrefixes(path, prefixes) && !pathHiddenByPrefixes(c.to, prefixes)
    })
    if (children.length === 0) continue
    result.push({ type: 'group', group: { ...entry.group, children } })
  }
  return result
}

function buildFieldAgentNav(filtered: WorkspaceNavEntry[]): WorkspaceNavEntry[] {
  return dedupeNavEntries(stripNavByPathPrefixes(filtered, FIELD_AGENT_HIDDEN_PREFIXES))
}

export function stripNavPaths(
  entries: WorkspaceNavEntry[],
  paths: Set<string>,
): WorkspaceNavEntry[] {
  const result: WorkspaceNavEntry[] = []
  for (const entry of entries) {
    if (entry.type === 'link') {
      if (!paths.has(navItemPath(entry.item))) result.push(entry)
      continue
    }
    if (entry.group.id === 'portals') continue
    const children = entry.group.children.filter((c) => !paths.has(navItemPath(c)))
    if (children.length === 0) continue
    result.push({ type: 'group', group: { ...entry.group, children } })
  }
  return result
}

export function removePortalsGroup(entries: WorkspaceNavEntry[]): WorkspaceNavEntry[] {
  return entries.filter((entry) => !(entry.type === 'group' && entry.group.id === 'portals'))
}

export function remapWorkspaceDashboard(
  entries: WorkspaceNavEntry[],
  portalHome: string,
  label = 'Dashboard',
): WorkspaceNavEntry[] {
  return entries.map((entry) => {
    if (entry.type === 'link' && entry.item.to === '/workspace' && entry.item.end) {
      return {
        type: 'link',
        item: { ...entry.item, to: portalHome, label, end: true },
      }
    }
    return entry
  })
}

export function resolvePortalHome(
  role: string,
  has: (p: Permission) => boolean,
): string | null {
  if (role === 'contractor' && has('portal.contractor')) return '/workspace/portals/contractor'
  if (role === 'landlord' && has('portal.owner')) return '/workspace/portals/owner'
  if (role === 'tenant' && has('portal.tenant')) return '/workspace/portals/tenant'
  return null
}

function portalDashboardLink(portalHome: string): WorkspaceNavEntry {
  return {
    type: 'link',
    item: { to: portalHome, label: 'Dashboard', end: true, icon: LayoutDashboard },
  }
}

const TENANT_OCCUPANCY_PORTAL_PATHS = [
  '/workspace/portals/tenant/leases',
  '/workspace/portals/tenant/payments',
  '/workspace/portals/tenant/maintenance',
  '/workspace/portals/tenant/messages',
  '/workspace/portals/tenant/complaints',
] as const

function buildTenantApplicantNav(
  filtered: WorkspaceNavEntry[],
  portalHome: string,
  occupancyReady: boolean,
): WorkspaceNavEntry[] {
  const promotedPaths = new Set([
    portalHome,
    '/workspace/portals/tenant/applications',
    '/workspace/portals/tenant/viewings',
    '/workspace/portals/tenant/enquiries',
    ACCOUNT_WISHLIST_PATH,
    '/workspace',
    ...CONTRACTOR_PORTAL_PATHS,
    ...OWNER_PORTAL_PATHS,
    ...(occupancyReady
      ? [
          ...TENANT_OCCUPANCY_PORTAL_PATHS,
          '/workspace/operations/maintenance',
          '/workspace/operations/communications',
        ]
      : []),
  ])

  const tenantPortalLinks: WorkspaceNavEntry[] = occupancyReady
    ? [
    {
      type: 'link',
      item: {
        to: '/workspace/portals/tenant/leases',
        label: 'My lease',
        permission: 'portal.tenant',
        icon: FileSignature,
      },
    },
    {
      type: 'link',
      item: {
        to: '/workspace/portals/tenant/payments',
        label: 'Payments',
        permission: 'portal.tenant',
        icon: CreditCard,
      },
    },
    {
      type: 'link',
      item: {
        to: '/workspace/portals/tenant/maintenance',
        label: 'Faults',
        permission: 'portal.tenant',
        icon: Wrench,
      },
    },
    {
      type: 'link',
      item: {
        to: '/workspace/portals/tenant/messages',
        label: 'Messages',
        permission: 'portal.tenant',
        icon: MessageCircle,
      },
    },
    {
      type: 'link',
      item: {
        to: '/workspace/portals/tenant/complaints',
        label: 'Complaints',
        permission: 'portal.tenant',
        icon: AlertTriangle,
      },
    },
  ]
    : []

  const prepend: WorkspaceNavEntry[] = [
    portalDashboardLink(portalHome),
    {
      type: 'link',
      item: {
        to: '/workspace/portals/tenant/applications',
        label: 'My applications',
        permission: 'portal.tenant',
        icon: ClipboardList,
      },
    },
    {
      type: 'link',
      item: {
        to: '/workspace/portals/tenant/viewings',
        label: 'Viewings',
        permission: 'portal.tenant',
        icon: CalendarDays,
      },
    },
    {
      type: 'link',
      item: {
        to: '/workspace/portals/tenant/enquiries',
        label: 'My enquiries',
        permission: 'portal.tenant',
        icon: MessageSquareText,
      },
    },
    {
      type: 'link',
      item: {
        to: ACCOUNT_WISHLIST_PATH,
        label: 'Wishlist',
        permission: 'portal.tenant',
        icon: Heart,
      },
    },
    ...tenantPortalLinks,
  ]

  const rest = stripNavPaths(removePortalsGroup(filtered), foreignPortalPathsForRole('tenant')).filter(
    (entry) => {
      if (entry.type !== 'link') return true
      const path = navItemPath(entry.item)
      return !promotedPaths.has(path)
    },
  )

  return dedupeNavEntries([...prepend, ...rest])
}


function buildLandlordOwnerNav(
  filtered: WorkspaceNavEntry[],
  portalHome: string,
): WorkspaceNavEntry[] {
  const promotedPaths = new Set([
    portalHome,
    '/workspace',
    '/workspace/applications',
    '/workspace/portals/owner/applications',
    '/workspace/operations/documents',
    '/workspace/operations/payments',
    '/workspace/operations/maintenance',
    '/workspace/properties',
    '/workspace/portals/owner',
    '/workspace/insights/reports',
    ...TENANT_PORTAL_PATHS,
    ...CONTRACTOR_PORTAL_PATHS,
  ])

  const prepend: WorkspaceNavEntry[] = [
    portalDashboardLink(portalHome),
    {
      type: 'link',
      item: {
        to: '/workspace/portals/owner/applications',
        label: 'Applications',
        permission: 'portal.owner',
        icon: ClipboardList,
      },
    },
    {
      type: 'link',
      item: {
        to: '/workspace/properties',
        label: 'My properties',
        anyOf: ['assets.view', 'listings.publish'],
        icon: Building2,
      },
    },
    {
      type: 'link',
      item: {
        to: '/workspace/operations/documents',
        label: 'Documents',
        permission: 'documents.view',
        icon: FileText,
      },
    },
    {
      type: 'link',
      item: {
        to: '/workspace/operations/payments',
        label: 'Payments',
        permission: 'payments.view',
        icon: CreditCard,
      },
    },
    {
      type: 'link',
      item: {
        to: '/workspace/operations/maintenance',
        label: 'Maintenance',
        permission: 'maintenance.view',
        icon: Wrench,
      },
    },
    // One Reports page: Owner statement and Rent roll are tabs on it.
    {
      type: 'link',
      item: {
        to: '/workspace/insights/reports',
        label: 'Reports',
        permission: 'reports.view',
        icon: ScrollText,
      },
    },
  ]

  // CR6: landlords keep assets.manage (own properties) but never see the agency Landlords directory.
  const landlordHidden = new Set([...foreignPortalPathsForRole('landlord'), '/workspace/people/landlords'])
  const rest = stripNavPaths(removePortalsGroup(filtered), landlordHidden).filter(
    (entry) => {
      if (entry.type !== 'link') return true
      const path = navItemPath(entry.item)
      return !promotedPaths.has(path)
    },
  )

  return dedupeNavEntries([...prepend, ...rest])
}

function buildPortalActorNav(
  filtered: WorkspaceNavEntry[],
  portalHome: string,
  role: string,
): WorkspaceNavEntry[] {
  const foreign = foreignPortalPathsForRole(role)
  const rest = stripNavPaths(removePortalsGroup(filtered), foreign).filter((entry) => {
    if (entry.type !== 'link') return true
    const path = navItemPath(entry.item)
    if (path === '/workspace') return false
    if (path === portalHome) return false
    return true
  })

  return dedupeNavEntries([portalDashboardLink(portalHome), ...rest])
}

/** Contractor: their dashboard, jobs, bookings, conduct, help and settings. */
function buildContractorNav(portalHome: string): WorkspaceNavEntry[] {
  const link = (to: string, label: string, icon: LucideIcon, end?: boolean): WorkspaceNavEntry => ({
    type: 'link',
    item: { to, label, icon, ...(end ? { end } : {}) },
  })
  return [
    portalDashboardLink(portalHome),
    link('/workspace/operations/maintenance', 'My jobs', Wrench),
    link('/workspace/portals/contractor/bookings', 'Bookings', CalendarClock),
    link('/workspace/conduct', 'Complaints & warnings', Flag),
    link('/workspace/account/settings', 'Settings', Settings),
    link('/workspace/help', 'Help & support', LifeBuoy),
  ]
}

export type WorkspaceNavActorInput = {
  role: string
  has: (p: Permission) => boolean
  hasAny: (p: Permission[]) => boolean
  tenantOccupancyReady?: boolean
  tenantHasStaffNav?: boolean
}

/** Permission-filtered nav with portal-actor dedupe and cross-portal link stripping. */
export function buildWorkspaceNavForActor(input: WorkspaceNavActorInput): WorkspaceNavEntry[] {
  const filtered = filterWorkspaceNav(getWorkspaceNav(), input.has, input.hasAny)

  if (input.role === 'ground_agent' || input.role === 'agent') {
    return buildFieldAgentNav(filtered)
  }

  const portalHome = resolvePortalHome(input.role, input.has)

  if (!portalHome) return dedupeNavEntries(filtered)

  const isPureTenantApplicant =
    input.role === 'tenant' && input.has('portal.tenant') && !input.tenantHasStaffNav

  if (isPureTenantApplicant) {
    return buildTenantApplicantNav(filtered, portalHome, input.tenantOccupancyReady ?? false)
  }

  if (input.role === 'landlord' && input.has('portal.owner')) {
    return buildLandlordOwnerNav(filtered, portalHome)
  }

  if (input.role === 'contractor' && input.has('portal.contractor')) {
    return buildContractorNav(portalHome)
  }

  return buildPortalActorNav(filtered, portalHome, input.role)
}

export function filterWorkspaceNav(
  entries: WorkspaceNavEntry[],
  has: (p: Permission) => boolean,
  hasAny: (p: Permission[]) => boolean,
): WorkspaceNavEntry[] {
  const result: WorkspaceNavEntry[] = []
  for (const entry of entries) {
    if (entry.type === 'link') {
      if (canAccessItem(entry.item, has, hasAny)) result.push(entry)
      continue
    }
    const children = entry.group.children.filter((c) => canAccessItem(c, has, hasAny))
    if (children.length === 0) continue
    // One visible child + not a primary menu → promote to a top-level link
    if (children.length === 1 && !KEEP_GROUPED.has(entry.group.id)) {
      result.push({
        type: 'link',
        item: { ...children[0], label: entry.group.label, icon: entry.group.icon },
      })
      continue
    }
    result.push({ type: 'group', group: { ...entry.group, children } })
  }

  if (flattenNavLinks(result).length <= NAV_SMART_FLATTEN_MAX) {
    return flattenAllNavGroups(result)
  }
  return result
}

export function flattenNavLinks(entries: WorkspaceNavEntry[]): FlatNavItem[] {
  return entries.flatMap((entry) => (entry.type === 'link' ? [entry.item] : entry.group.children))
}

/** Labels this permission pack would unlock in the sidebar (for create-user preview). */
export function previewNavLabels(permissions: Permission[]): string[] {
  const set = new Set(permissions)
  const has = (p: Permission) => set.has(p)
  const hasAny = (ps: Permission[]) => ps.some((p) => set.has(p))
  return flattenNavLinks(filterWorkspaceNav(getWorkspaceNav(), has, hasAny)).map((i) => i.label)
}

export type MarketplaceNavItem = {
  to: string
  label: string
  icon: LucideIcon
}

export const marketplaceCategories: MarketplaceNavItem[] = [
  { to: '/browse?mode=buy', label: 'Buy', icon: Landmark },
  { to: '/browse?mode=rent', label: 'Rent', icon: KeyRound },
  { to: '/browse?mode=commercial', label: 'Commercial', icon: Building2 },
  { to: '/calculators', label: 'Calculators', icon: Calculator },
]

export const marketplaceFooter = [
  {
    title: 'Explore',
    links: [
      ['Buy', '/browse?mode=buy'],
      ['Rent', '/browse?mode=rent'],
      ['Commercial', '/browse?mode=commercial'],
      ['Calculators', '/calculators'],
    ],
  },
  {
    title: 'Home loans',
    links: [
      ['Mortgage bond', '/calculators/mortgage-bond'],
      ['Affordability', '/calculators/affordability'],
      ['Additional payments', '/calculators/additional-payment'],
      ['Bond & transfer', '/calculators/bond-transfer'],
    ],
  },
  {
    title: 'For agents',
    links: [
      ['Workspace', '/workspace'],
      ['Leads', '/workspace/sales/crm'],
      ['Operations', '/workspace/operations/maintenance'],
    ],
  },
  {
    title: 'Portals',
    links: [
      ['Owners', '/workspace/portals/owner'],
      ['Tenants', '/workspace/portals/tenant'],
      ['Contractors', '/workspace/portals/contractor'],
    ],
  },
] as const

export function pathMatches(pathname: string, to: string, end?: boolean) {
  if (end) return pathname === to
  if (to === '/workspace') return pathname === '/workspace'
  const pathOnly = to.split('?')[0]
  return pathname === pathOnly || pathname.startsWith(`${pathOnly}/`)
}
