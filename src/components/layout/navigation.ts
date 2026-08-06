import type { LucideIcon } from 'lucide-react'
import {
  Building2,
  Calculator,
  ClipboardList,
  CreditCard,
  Eye,
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
  Landmark,
  Bell,
  MessageSquare,
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
            to: '/workspace/operations/contractors',
            label: 'Contractors',
            permission: 'contractors.view',
            icon: HardHat,
          },
          {
            to: '/workspace/operations/payments',
            label: 'Payments',
            permission: 'payments.view',
            icon: CreditCard,
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
            to: '/workspace/people/landlords',
            label: 'Landlords',
            anyOf: ['users.manage', 'assets.manage'],
            icon: KeyRound,
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
            to: '/workspace/admin/notifications',
            label: 'Notifications',
            anyOf: ['notifications.broadcast', 'platform.manage'],
            icon: Bell,
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
const KEEP_GROUPED = new Set(['admin', 'portals', 'sales', 'operations', 'people'])

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
