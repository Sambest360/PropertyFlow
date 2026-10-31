/** Client for the admin dashboard (server/adminDashboardRoutes.ts). Shapes mirror server/adminDashboard.ts. */
import type { Permission, Role } from '../../types/domain'
import type { DashboardSectionId } from '../adminDashboardAccess'
import { actorHeaders } from './actorAuth'
import { resolveApiAuthorizationHeader } from './authClient'

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) || ''

export type Amount = { count: number; amount: number }

export type DashboardKpis = {
  agencies?: { total: number; active: number; inactive: number; byStatus: Record<string, number> }
  people?: { total: number; byRole: Partial<Record<Role, number>>; inactive: number; new30: number; pendingReview: number }
  portfolio?: { buildings: number; units: number; occupied: number; vacant: number; occupancyRate: number | null }
  listings?: { published: number; forSale: number; toRent: number; featured: number; noPhotos: number; drafts: number }
  leads?: { total: number; last7: number; last30: number; prev30: number; buy30: number; rent30: number; byStage: Array<{ stage: string; count: number }> }
  viewings?: { last7: number; last30: number; next7: number; noShow30: number }
  applications?: { byStatus: Record<string, number>; open: number; stale: number; staleAfterDays: number }
  leases?: { active: number; notice: number; pending: number; expiring: { d30: number; d60: number; d90: number }; monthlyRentRoll: number }
  payments?: { paidThisMonth: Amount; overdue: Amount; outstanding: Amount; dueThisMonth: Amount }
  maintenance?: { open: number; byPriority: Record<string, number>; slaBreached: number }
}

export type TrendPoint = {
  date: string
  leads: number | null
  applications: number | null
  payments: number | null
  paymentsAmount: number | null
  users: number | null
}

export type AgencyRow = {
  clientId: string
  agencyId: string
  name: string
  status: string
  createdAt: string
  users: number
  staff: number
  buildings: number
  units: number
  occupied: number
  occupancyRate: number | null
  listings: number
  openApplications: number
  overdueCount: number
  overdueAmount: number
  openTickets: number
  lastActivityAt: string | null
}

export type ActivityItem = {
  id: string
  at: string
  type: string
  label: string
  detail: string | null
  actorName: string | null
  actorRole: Role | null
  agencyName: string | null
}

export type AttentionItem = {
  id: string
  tone: 'danger' | 'warning' | 'neutral'
  label: string
  count: number
  amount?: number
  href: string
}

export type HealthInfo = {
  database: 'up' | 'down'
  latencyMs: number | null
  commit: string | null
  authMode: string | null
  lastBackupAt: string | null
  backupDir: string | null
  emailLog: { available: boolean; failed24h: number; failed7d: number; sent24h: number; notConfigured24h: number }
}

export type DashboardPayload = {
  scope: { kind: 'platform' | 'agency'; agencyId: string | null; agencyName: string | null }
  viewerRole: Role
  sections: DashboardSectionId[]
  generatedAt: string
  kpis: DashboardKpis
  trends: TrendPoint[]
  agencies?: AgencyRow[]
  activity?: ActivityItem[]
  attention: AttentionItem[]
  health?: HealthInfo
}

export type AccessPerson = {
  id: string
  name: string
  email: string | null
  role: Role
  active: boolean
  agencyId: string | null
  agencyName: string | null
  enabledPermissions: Permission[] | null
  agencyEnabledPermissions: Permission[] | null
}

export type AccessPayload = {
  people: AccessPerson[]
  collections: Record<string, Permission[]>
  writes: Record<string, Permission>
}

export class DashboardApiError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function call<T>(path: string): Promise<T> {
  const auth = await resolveApiAuthorizationHeader().catch(() => ({}))
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...actorHeaders(), ...auth },
  })
  const json = (await res.json().catch(() => ({}))) as T & { message?: string }
  if (!res.ok) throw new DashboardApiError(json.message || `Request failed (${res.status})`, res.status)
  return json
}

export const fetchAdminDashboard = () => call<DashboardPayload>('/api/admin/dashboard')
export const fetchAccessPeople = () => call<AccessPayload>('/api/admin/access')
