import type { LucideIcon } from 'lucide-react'
import {
  Building2,
  Briefcase,
  LayoutDashboard,
  Menu,
  Wrench,
} from 'lucide-react'
import type { Permission, Role } from '../types/domain'
import { pathMatches } from '../components/layout/navigation'

export type BottomNavTab = {
  id: string
  label: string
  icon: LucideIcon
  to?: string
  /** Opens full navigation drawer instead of routing */
  action?: 'more'
  isActive: (pathname: string) => boolean
}

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

  let salesTo: string | null = null
  if (has('applications.view')) salesTo = '/workspace/sales/applications'
  else if (hasAny(['leads.view', 'leads.manage'])) salesTo = '/workspace/sales/crm'
  else if (has('viewings.manage')) salesTo = '/workspace/sales/viewings'

  if (salesTo) {
    tabs.push({
      id: 'sales',
      label: 'Sales',
      icon: Briefcase,
      to: salesTo,
      isActive: (p) => pathMatches(p, '/workspace/sales'),
    })
  }

  let opsTo: string | null = null
  if (has('maintenance.view')) opsTo = '/workspace/operations/maintenance'
  else if (has('messages.manage')) opsTo = '/workspace/people/communications'
  else if (has('payments.view')) opsTo = '/workspace/operations/payments'

  if (opsTo) {
    tabs.push({
      id: 'operations',
      label: 'Ops',
      icon: Wrench,
      to: opsTo,
      isActive: (p) => pathMatches(p, '/workspace/operations') || pathMatches(p, '/workspace/people/communications'),
    })
  }

  tabs.push({
    id: 'more',
    label: 'More',
    icon: Menu,
    action: 'more',
    isActive: () => false,
  })

  return tabs.slice(0, 5)
}
