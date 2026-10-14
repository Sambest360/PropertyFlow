import type { LucideIcon } from 'lucide-react'
import {
  Building2,
  Briefcase,
  CreditCard,
  HardHat,
  LayoutDashboard,
  Menu,
  Wrench,
} from 'lucide-react'
import type { Permission, Role } from '../types/domain'
import { pathMatches } from '../components/layout/navigation'
import { resolveWorkspaceApplicationsPath } from './workspaceRedirects'

export type BottomNavTab = {
  id: string
  label: string
  icon: LucideIcon
  to?: string
  /** Opens full navigation drawer instead of routing */
  action?: 'more'
  isActive: (pathname: string) => boolean
}

export const BOTTOM_NAV_MAX = 5

export function resolveWorkspaceBottomNavTabs(input: {
  has: (p: Permission) => boolean
  hasAny: (p: Permission[]) => boolean
  role: Role
  dashboardTo: string
}): BottomNavTab[] {
  const { has, hasAny, dashboardTo } = input
  const tabs: BottomNavTab[] = []

  tabs.push({
    id: 'dashboard',
    label: 'Home',
    icon: LayoutDashboard,
    to: dashboardTo,
    isActive: (p) =>
      pathMatches(p, dashboardTo, dashboardTo === '/workspace') ||
      (dashboardTo !== '/workspace' && pathMatches(p, dashboardTo)),
  })

  if (hasAny(['assets.view', 'listings.publish'])) {
    tabs.push({
      id: 'properties',
      label: 'Properties',
      icon: Building2,
      to: '/workspace/properties',
      isActive: (p) => pathMatches(p, '/workspace/properties'),
    })
  }

  if (has('portal.owner')) {
    const appsTo = resolveWorkspaceApplicationsPath(has, input.role)
    tabs.push({
      id: 'applications',
      label: 'Applications',
      icon: Briefcase,
      to: appsTo,
      isActive: (p) => pathMatches(p, appsTo) || pathMatches(p, '/workspace/applications'),
    })
  } else if (has('applications.view')) {
    tabs.push({
      id: 'applications',
      label: 'Applicants',
      icon: Briefcase,
      to: '/workspace/sales/applications',
      isActive: (p) => pathMatches(p, '/workspace/sales/applications'),
    })
  } else if (hasAny(['leads.view', 'leads.manage'])) {
    tabs.push({
      id: 'leads',
      label: 'Leads',
      icon: Briefcase,
      to: '/workspace/sales/crm',
      isActive: (p) => pathMatches(p, '/workspace/sales/crm'),
    })
  } else if (has('viewings.manage')) {
    tabs.push({
      id: 'viewings',
      label: 'Viewings',
      icon: Briefcase,
      to: '/workspace/sales/viewings',
      isActive: (p) => pathMatches(p, '/workspace/sales/viewings'),
    })
  }

  if (has('maintenance.view')) {
    tabs.push({
      id: 'maintenance',
      label: 'Maintenance',
      icon: Wrench,
      to: '/workspace/operations/maintenance',
      isActive: (p) => pathMatches(p, '/workspace/operations/maintenance'),
    })
  }

  if (has('payments.view')) {
    tabs.push({
      id: 'payments',
      label: 'Payments',
      icon: CreditCard,
      to: '/workspace/operations/payments',
      isActive: (p) => pathMatches(p, '/workspace/operations/payments'),
    })
  } else if (has('portal.tenant') && has('payments.manage')) {
    tabs.push({
      id: 'payments',
      label: 'Payments',
      icon: CreditCard,
      to: '/workspace/portals/tenant/payments',
      isActive: (p) => pathMatches(p, '/workspace/portals/tenant/payments'),
    })
  }

  if (has('contractors.view')) {
    tabs.push({
      id: 'contractors',
      label: 'Contractors',
      icon: HardHat,
      to: '/workspace/operations/contractors',
      isActive: (p) => pathMatches(p, '/workspace/operations/contractors'),
    })
  }

  if (has('messages.manage')) {
    tabs.push({
      id: 'messages',
      label: 'Messages',
      icon: Briefcase,
      to: '/workspace/operations/communications',
      isActive: (p) => pathMatches(p, '/workspace/operations/communications'),
    })
  }

  if (tabs.length <= BOTTOM_NAV_MAX) {
    return tabs
  }

  const primary = tabs.slice(0, BOTTOM_NAV_MAX - 1)
  primary.push({
    id: 'more',
    label: 'More',
    icon: Menu,
    action: 'more',
    isActive: () => false,
  })
  return primary
}
