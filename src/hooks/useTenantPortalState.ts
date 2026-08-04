import { useMemo } from 'react'
import { useStore } from '../context/AppStore'
import { useAuth } from '../context/AuthContext'
import { blockedPropertyIdsForApplicant } from '../lib/blockedApplicants'
import { tenantHasApprovedOccupancy } from '../lib/tenantOccupancy'
import type {
  AppNotification,
  Application,
  MaintenanceTicket,
  Message,
  MessageThread,
  PaymentRecord,
  PropertyAsset,
  Tenancy,
} from '../types/domain'

export type TenantPortalState = {
  occupancyReady: boolean
  blockedIds: Set<string>
  apps: Application[]
  app: Application | undefined
  tenancy: Tenancy | undefined
  property: PropertyAsset | null
  tickets: MaintenanceTicket[]
  payments: PaymentRecord[]
  notes: AppNotification[]
  threads: MessageThread[]
  messages: Message[]
  agencyId: string | null
  user: ReturnType<typeof useAuth>['user']
}

export function useTenantPortalState(): TenantPortalState {
  const { state } = useStore()
  const { user, agencyId } = useAuth()

  const occupancyReady = tenantHasApprovedOccupancy(state.applications, state.tenancies, user)

  const blockedIds = useMemo(
    () => blockedPropertyIdsForApplicant(state.applications, user),
    [state.applications, user],
  )

  const apps = useMemo(
    () =>
      state.applications.filter(
        (a) =>
          (a.applicantUserId === user.id || a.email === user.email) &&
          a.stage !== 'Blocked' &&
          !blockedIds.has(a.propertyId),
      ),
    [state.applications, user, blockedIds],
  )

  const app = apps.find((a) => a.stage !== 'Active Tenancy') ?? apps[0]
  const tenancy = state.tenancies.find(
    (t) => t.tenantUserId === user.id && !blockedIds.has(t.propertyId),
  )

  const property = app
    ? (state.properties.find((p) => p.id === app.propertyId) ?? null)
    : tenancy
      ? (state.properties.find((p) => p.id === tenancy.propertyId) ?? null)
      : null

  const tickets = state.tickets.filter(
    (t) => t.reportedByUserId === user.id || t.reportedBy === user.name,
  )
  const payments = state.payments.filter(
    (p) => p.partyUserId === user.id || p.partyName === user.name,
  )
  const notes = state.notifications.filter((n) => n.userId === user.id)
  const threads = state.threads.filter((t) => t.participantIds.includes(user.id))
  const messages = state.messages

  return {
    occupancyReady,
    blockedIds,
    apps,
    app,
    tenancy,
    property,
    tickets,
    payments,
    notes,
    threads,
    messages,
    agencyId,
    user,
  }
}
