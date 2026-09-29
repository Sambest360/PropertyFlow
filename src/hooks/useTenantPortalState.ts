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
  Viewing,
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
  /** Every viewing booked under the tenant's name/email, newest first. */
  viewings: Viewing[]
  /** Properties linked to those viewings (existing record first, then public listings). */
  viewingProperties: PropertyAsset[]
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

  const email = user.email?.toLowerCase()
  // A viewing belongs to the tenant when it was booked under their name or email
  // (ListingDetail bookings capture name/email; agent-created bookings use the
  // applicant's name/email from the application).
  const viewings = useMemo(() => {
    const nameKey = user.name.trim().toLowerCase()
    const emailMatches = email
      ? state.viewings.filter((v) => v.applicantEmail?.toLowerCase() === email)
      : []
    const seenIds = new Set(emailMatches.map((v) => v.id))
    const seenKeys = new Set(
      emailMatches.map((v) => `${v.propertyId}|${v.date}|${v.time}`.toLowerCase()),
    )
    const nameMatches = state.viewings.filter(
      (v) =>
        !seenIds.has(v.id) &&
        v.applicantName.trim().toLowerCase() === nameKey &&
        !seenKeys.has(`${v.propertyId}|${v.date}|${v.time}`.toLowerCase()),
    )
    // Collapse optimistic-store/server duplicates (same property + date + time
    // + status can exist transiently with different ids during hydration).
    const combined: Viewing[] = []
    const allKeys = new Set<string>()
    for (const v of [...emailMatches, ...nameMatches]) {
      const key = `${v.propertyId}|${v.date}|${v.time}|${v.status}`.toLowerCase()
      if (allKeys.has(key)) continue
      allKeys.add(key)
      combined.push(v)
    }
    return combined.sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))
  }, [state.viewings, user.name, email])

  const viewingProperties = useMemo(() => {
    const props: PropertyAsset[] = []
    const seen = new Set<string>()
    for (const v of viewings) {
      const prop = state.properties.find((p) => p.id === v.propertyId)
      if (prop && !seen.has(prop.id)) {
        seen.add(prop.id)
        props.push(prop)
      }
    }
    return props
  }, [viewings, state.properties])

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
    viewings,
    viewingProperties,
    agencyId,
    user,
  }
}
