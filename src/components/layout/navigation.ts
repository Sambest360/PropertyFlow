import type { LucideIcon } from 'lucide-react'
import {
  Building2,
  Calculator,
  ClipboardList,
  CreditCard,
  Eye,
  FileText,
  HardHat,
  Home,
  LayoutDashboard,
  Search,
  Settings,
  Users,
  Wrench,
  BarChart3,
  Briefcase,
  KeyRound,
  Landmark,
  Receipt,
  GitBranch,
  Bell,
} from 'lucide-react'
import type { Permission, Role } from '../../types/domain'

export type FlatNavItem = {
  to: string
  label: string
  end?: boolean
  permission?: Permission
  anyOf?: Permission[]
  icon: LucideIcon
  /** Optional section heading in the sidebar */
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

/** Role-aware navigation: Dashboard + three management groups for staff. */
export function getWorkspaceNav(role: Role): WorkspaceNavEntry[] {
  if (role === 'super_admin') {
    return [
      { type: 'link', item: { to: '/workspace', label: 'Dashboard', end: true, icon: LayoutDashboard } },
      {
        type: 'group',
        group: {
          id: 'property',
          label: 'Property Management',
          icon: Building2,
          children: [
            { to: '/workspace/properties', label: 'Properties', icon: Building2 },
            { to: '/workspace/sales/applications', label: 'Applicants', icon: ClipboardList },
            { to: '/workspace/operations/maintenance', label: 'Maintenance', icon: Wrench },
          ],
        },
      },
      {
        type: 'group',
        group: {
          id: 'admin',
          label: 'Administration Management',
          icon: Settings,
          children: [
            { to: '/workspace/platform', label: 'Agencies', end: true, icon: Landmark },
            { to: '/workspace/platform/billing', label: 'Billing', icon: Receipt },
            { to: '/workspace/admin/suite-alerts', label: 'Suite alerts', icon: Bell },
            { to: '/workspace/insights/reports', label: 'Reports', icon: BarChart3 },
          ],
        },
      },
    ]
  }

  if (role === 'landlord') {
    return [
      { type: 'link', item: { to: '/workspace', label: 'Dashboard', end: true, icon: LayoutDashboard } },
      {
        type: 'group',
        group: {
          id: 'property',
          label: 'Property Management',
          icon: Building2,
          children: [
            { to: '/workspace/portals/owner', label: 'Owner portal', icon: KeyRound },
            { to: '/workspace/properties', label: 'My buildings', icon: Building2 },
            { to: '/workspace/operations/payments', label: 'Rent receipts', icon: CreditCard },
          ],
        },
      },
    ]
  }

  if (role === 'tenant') {
    return [
      { type: 'link', item: { to: '/workspace', label: 'Dashboard', end: true, icon: LayoutDashboard } },
      {
        type: 'group',
        group: {
          id: 'property',
          label: 'Property Management',
          icon: Building2,
          children: [
            { to: '/workspace/portals/tenant', label: 'My portal', icon: Home },
            { to: '/workspace/operations/payments', label: 'Payments', icon: CreditCard },
            { to: '/workspace/operations/maintenance', label: 'Maintenance', icon: Wrench },
            { to: '/browse', label: 'Browse homes', icon: Search },
          ],
        },
      },
      {
        type: 'group',
        group: {
          id: 'users',
          label: 'User Management',
          icon: Users,
          children: [
            { to: '/workspace/sales/applications', label: 'Applications', icon: FileText },
          ],
        },
      },
    ]
  }

  if (role === 'contractor') {
    return [
      { type: 'link', item: { to: '/workspace', label: 'Dashboard', end: true, icon: LayoutDashboard } },
      {
        type: 'group',
        group: {
          id: 'property',
          label: 'Property Management',
          icon: Building2,
          children: [
            { to: '/workspace/portals/contractor', label: 'Job board', icon: HardHat },
            { to: '/workspace/operations/maintenance', label: 'Maintenance', icon: Wrench },
          ],
        },
      },
    ]
  }

  // Staff / agency roles
  return [
    { type: 'link', item: { to: '/workspace', label: 'Dashboard', end: true, icon: LayoutDashboard } },
    {
      type: 'group',
      group: {
        id: 'property',
        label: 'Property Management',
        icon: Building2,
        children: [
          {
            to: '/workspace/properties',
            label: 'Properties',
            anyOf: ['assets.view', 'listings.publish'],
            icon: Building2,
          },
          {
            to: '/workspace/sales/viewings',
            label: 'Viewings',
            permission: 'viewings.manage',
            icon: Eye,
          },
          {
            to: '/workspace/operations/maintenance',
            label: 'Maintenance',
            permission: 'maintenance.view',
            icon: Wrench,
          },
          {
            to: '/workspace/operations/payments',
            label: 'Payments',
            permission: 'payments.view',
            icon: CreditCard,
          },
        ],
      },
    },
    {
      type: 'group',
      group: {
        id: 'users',
        label: 'User Management',
        icon: Users,
        children: [
          {
            to: '/workspace/sales/applications',
            label: 'Applicants',
            permission: 'applications.view',
            icon: ClipboardList,
          },
          {
            to: '/workspace/sales/crm',
            label: 'Leads',
            anyOf: ['leads.view', 'leads.manage'],
            icon: Briefcase,
          },
          {
            to: '/workspace/sales/pipeline',
            label: 'Pipeline',
            anyOf: ['leads.view', 'leads.manage'],
            icon: GitBranch,
          },
          {
            to: '/workspace/people/staff',
            label: 'Staff & agents',
            permission: 'users.manage',
            icon: Users,
          },
          {
            to: '/workspace/people/tenants',
            label: 'Occupants',
            permission: 'occupants.view',
            icon: KeyRound,
          },
        ],
      },
    },
    {
      type: 'group',
      group: {
        id: 'admin',
        label: 'Administration Management',
        icon: Settings,
        children: [
          {
            to: '/workspace/admin',
            label: 'Admin',
            anyOf: ['users.manage', 'roles.assign', 'tenant.manage'],
            icon: Settings,
          },
          {
            to: '/workspace/admin/suite-alerts',
            label: 'Suite alerts',
            anyOf: ['users.manage', 'roles.assign', 'tenant.manage'],
            icon: Bell,
          },
          {
            to: '/workspace/insights/reports',
            label: 'Reports',
            permission: 'reports.view',
            icon: BarChart3,
          },
        ],
      },
    },
  ]
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
    result.push({ type: 'group', group: { ...entry.group, children } })
  }
  return result
}

/** Flatten leaf links for active-route helpers. */
export function flattenNavLinks(entries: WorkspaceNavEntry[]): FlatNavItem[] {
  return entries.flatMap((entry) => (entry.type === 'link' ? [entry.item] : entry.group.children))
}

/** @deprecated use filterWorkspaceNav */
export function filterFlatNav(
  items: FlatNavItem[],
  has: (p: Permission) => boolean,
  hasAny: (p: Permission[]) => boolean,
): FlatNavItem[] {
  return items.filter((item) => canAccessItem(item, has, hasAny))
}

/** Group consecutive items that share the same section label. */
export function groupNavBySection(items: FlatNavItem[]): Array<{ section: string | null; items: FlatNavItem[] }> {
  const groups: Array<{ section: string | null; items: FlatNavItem[] }> = []
  for (const item of items) {
    const section = item.section ?? null
    const last = groups[groups.length - 1]
    if (last && last.section === section) {
      last.items.push(item)
    } else {
      groups.push({ section, items: [item] })
    }
  }
  return groups
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
      ['Sales CRM', '/workspace/sales/crm'],
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

/** @deprecated kept for any leftover imports */
export type NavItem = FlatNavItem | { label: string; children: FlatNavItem[]; anyOf?: Permission[] }
export const workspaceNav: NavItem[] = flattenNavLinks(getWorkspaceNav('client_admin'))
