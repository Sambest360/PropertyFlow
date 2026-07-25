import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type {
  Agency,
  AppUser,
  Application,
  ApplicationDocument,
  ApplicationStage,
  Lead,
  MaintenanceTicket,
  Message,
  MessageThread,
  AppNotification,
  PaymentRecord,
  PropertyAsset,
  PropertyDocument,
  PropertyEvent,
  Role,
  Room,
  SuiteAlertAction,
  SuiteAlertResource,
  SuiteAlertRule,
  Tenancy,
  Viewing,
  ViewingSlot,
  Activity,
} from '../types/domain'
import {
  seedAgencies,
  seedApplications,
  seedActivities,
  seedLeads,
  seedMessages,
  seedNotifications,
  seedPayments,
  seedProperties,
  seedPropertyDocuments,
  seedTenancies,
  seedThreads,
  seedTickets,
  seedUsers,
  seedViewingSlots,
  seedViewings,
  uid,
} from '../data/seed'
import {
  seedBuildings,
  seedInfraRooms,
  seedInternalAssets,
  seedLookups,
  seedUnits,
  propertiesFromInfrastructure,
} from '../data/infraSeed'
import type { MarkPaymentPaidDetails } from '../components/payments/types'
import type { AssetCondition, Building, InfraRoom, InternalAsset, LookupConfig, RoomKind, Unit, UnitTemplate } from '../data/infrastructure'
import { UNIT_TEMPLATES } from '../data/infrastructure'
import {
  allDocsUploaded,
  buildDocumentChecklist,
  STAGE_PROGRESS,
} from '../lib/workflow'
import {
  SEED_BILLING_PLANS,
  SEED_SUBSCRIPTIONS,
  runBillingCycle,
  type BillingPlan,
  type ClientSubscription,
  type PlatformInvoice,
} from '../lib/billingEngine'
import {
  SEED_VENDOR_ROUTES,
  applyTicketPatch,
  buildTicketFromCreate,
  canManageTickets,
  isWarrantyCovered,
  needsEmergencyEscalationPrecise,
  resolvePreferredVendor,
  toUiPriority,
  validateTicketCompletion,
  type CreateTicketRequest,
  type CreateTicketResult,
  type PatchTicketRequest,
  type PatchTicketResult,
  type VendorCategoryRoute,
} from '../lib/maintenanceApi'
import {
  fromDomainApplicationType,
  resolveUnitForProperty,
  validateApplicationSubmission,
  type SubmitApplicationResult,
} from '../lib/applicationApi'
import {
  patchApplicationStatus,
  type PatchApplicationStatusRequest,
  type PatchApplicationStatusResult,
} from '../lib/api/applicationStatusApi'
import { rolePermissions } from '../lib/permissions'
import { buildSeedPropertyEvents } from '../lib/propertyHistory'
import {
  buildDefaultSuiteAlerts,
  DEFAULT_POPUP_DURATION_MS,
  resolveSuiteAlert,
  toastToneForAction,
  type NotificationToast,
} from '../lib/suiteAlerts'
import {
  isApplicantBlockedOnProperty,
  viewingBelongsToApplication,
} from '../lib/blockedApplicants'

const STORAGE_KEY = 'propertyflow-v9'

export type AppState = {
  agencies: Agency[]
  users: AppUser[]
  properties: PropertyAsset[]
  buildings: Building[]
  units: Unit[]
  infraRooms: InfraRoom[]
  internalAssets: InternalAsset[]
  lookups: LookupConfig[]
  leads: Lead[]
  applications: Application[]
  viewingSlots: ViewingSlot[]
  viewings: Viewing[]
  payments: PaymentRecord[]
  tenancies: Tenancy[]
  threads: MessageThread[]
  messages: Message[]
  notifications: AppNotification[]
  suiteAlerts: SuiteAlertRule[]
  tickets: MaintenanceTicket[]
  activities: Activity[]
  propertyDocuments: PropertyDocument[]
  propertyEvents: PropertyEvent[]
  billingPlans: BillingPlan[]
  clientSubscriptions: ClientSubscription[]
  invoices: PlatformInvoice[]
  vendorRoutes: VendorCategoryRoute[]
}

type StoreContextValue = {
  state: AppState
  resetDemo: () => void
  createAgency: (input: Omit<Agency, 'id' | 'createdAt' | 'status'> & { status?: Agency['status'] }) => Agency
  updateAgency: (id: string, patch: Partial<Agency>) => void
  createUser: (input: Omit<AppUser, 'id' | 'active'> & { active?: boolean }) => AppUser
  updateUser: (id: string, patch: Partial<AppUser>) => void
  assignRole: (userId: string, role: Role, agencyId?: string | null) => void
  createProperty: (input: Omit<PropertyAsset, 'id' | 'createdAt' | 'rooms' | 'images'> & { images?: string[]; rooms?: Room[] }) => PropertyAsset
  updateProperty: (id: string, patch: Partial<PropertyAsset>) => void
  setPropertyRooms: (id: string, rooms: Room[]) => void
  publishProperty: (id: string, status?: PropertyAsset['status']) => void
  createBuilding: (input: Omit<Building, 'id' | 'createdAt' | 'images'> & { images?: string[] }) => Building
  createUnitFromTemplate: (input: {
    buildingId: string
    templateId: UnitTemplate['id']
    unitNumber: string
    title: string
    listingType: Unit['listingType']
    price: number | null
    rent: number | null
    agentId: string | null
  }) => Unit
  updateInternalAsset: (id: string, patch: Partial<InternalAsset>) => void
  addInternalAsset: (input: Omit<InternalAsset, 'id'>) => InternalAsset
  updateInfraRoom: (id: string, patch: Partial<InfraRoom>) => void
  addInfraRoom: (input: {
    unitId: string
    clientId: string
    name: string
    kind: RoomKind
    beds?: number
    baths?: number
    areaSqm?: number
    color?: string
    layout?: InfraRoom['layout']
  }) => InfraRoom
  removeInfraRoom: (id: string) => void
  removeInternalAsset: (id: string) => void
  blockApplication: (id: string, reason?: string) => void
  removeViewing: (id: string) => void
  removeViewingSlot: (id: string) => void
  transferViewingSlot: (fromSlotId: string, toSlotId: string) => boolean
  removeTicket: (id: string) => boolean
  removePayment: (id: string) => boolean
  updatePayment: (id: string, patch: Partial<PaymentRecord>) => void
  addPropertyDocument: (input: Omit<PropertyDocument, 'id'>) => PropertyDocument
  updatePropertyDocument: (id: string, patch: Partial<PropertyDocument>) => void
  removePropertyDocument: (id: string) => void
  addPropertyEvent: (input: Omit<PropertyEvent, 'id' | 'at'> & { at?: string }) => PropertyEvent
  createLead: (input: Omit<Lead, 'id' | 'createdAt' | 'updatedAt' | 'notes' | 'stage'> & { stage?: string; notes?: string }) => Lead
  updateLeadStage: (id: string, stage: string) => void
  createApplication: (input: {
    agencyId: string
    propertyId: string
    agentId: string | null
    applicantUserId?: string | null
    applicantName: string
    email: string
    phone: string
    type: 'Purchase' | 'Rental'
    income?: number
    employment?: string
    idNumberOrPassport?: string
    uploadedDocs?: Application['uploadedDocs']
    /** Skip income/availability guards (admin/demo only) */
    skipGuards?: boolean
  }) => Application | SubmitApplicationResult
  updateApplication: (id: string, patch: Partial<Application>) => void
  setDocumentStatus: (
    applicationId: string,
    key: string,
    status: ApplicationDocument['status'],
    note?: string,
  ) => void
  advanceApplication: (id: string, to?: ApplicationStage) => void
  approveApplication: (id: string) => PatchApplicationStatusResult
  /** Mirrors PATCH /api/v1/applications/{id}/status */
  patchApplicationStatus: (params: {
    applicationId: string
    actorUserId: string
    request: PatchApplicationStatusRequest
  }) => PatchApplicationStatusResult
  scheduleMoveIn: (id: string, moveInDate: string, keyCollection: NonNullable<Application['keyCollection']>) => void
  completeKeyHandover: (id: string) => void
  createViewingSlot: (input: Omit<ViewingSlot, 'id' | 'booked' | 'status'> & { capacity?: number }) => ViewingSlot
  updateViewingSlot: (id: string, patch: Partial<ViewingSlot>) => void
  bookViewingSlot: (slotId: string, applicantName: string, applicantEmail?: string, applicationId?: string) => Viewing | null
  createViewing: (input: Omit<Viewing, 'id' | 'status' | 'attendance' | 'slotId'> & Partial<Pick<Viewing, 'status' | 'attendance' | 'slotId'>>) => Viewing
  updateViewing: (id: string, patch: Partial<Viewing>) => void
  createPayment: (input: Omit<PaymentRecord, 'id' | 'paidAt' | 'method' | 'status'> & Partial<Pick<PaymentRecord, 'status' | 'paidAt' | 'method'>>) => PaymentRecord
  markPaymentPaid: (id: string, details?: string | MarkPaymentPaidDetails) => void
  sendMessage: (threadId: string, fromUserId: string, body: string) => Message
  createThread: (input: Omit<MessageThread, 'id' | 'updatedAt'> & { initialMessage: string; fromUserId: string }) => MessageThread
  createTicket: (input: Omit<MaintenanceTicket, 'id' | 'openedAt' | 'status' | 'cost' | 'photos' | 'contractorId' | 'assignedAgentId' | 'reportedByUserId'> & Partial<Pick<MaintenanceTicket, 'status' | 'cost' | 'photos' | 'contractorId' | 'assignedAgentId' | 'reportedByUserId' | 'categoryKey' | 'unitId' | 'internalAssetId' | 'warrantyCovered'>>) => MaintenanceTicket
  createMaintenanceTicket: (params: {
    actorUserId: string
    request: CreateTicketRequest
    propertyId?: string
  }) => CreateTicketResult
  updateTicket: (id: string, patch: Partial<MaintenanceTicket>) => void
  patchMaintenanceTicket: (params: {
    actorUserId: string
    ticketId: string
    patch: PatchTicketRequest
  }) => PatchTicketResult
  runEmergencyEscalations: () => number
  notify: (
    input: Omit<AppNotification, 'id' | 'at' | 'read'> & {
      read?: boolean
      silent?: boolean
      popupDurationMs?: number
    },
  ) => AppNotification
  emitSuiteEvent: (input: {
    agencyId: string | null
    resource: SuiteAlertResource
    action: SuiteAlertAction
    title: string
    body: string
    link?: string
    actorUserId?: string | null
    includeActor?: boolean
  }) => void
  markNotificationRead: (id: string) => void
  markAllNotificationsRead: (userId: string) => void
  dismissToast: (id: string) => void
  updateSuiteAlert: (id: string, patch: Partial<SuiteAlertRule>) => void
  addActivity: (text: string, user: string, agencyId: string | null) => void
  runClientBillingCycle: (clientId: string, periodStart?: string, periodEnd?: string) => PlatformInvoice | null
  markInvoicePaid: (invoiceId: string) => void
  toasts: NotificationToast[]
}

const INFRA_PROPERTY_IDS = new Set(propertiesFromInfrastructure().map((p) => p.id))

const defaultState = (): AppState => ({
  agencies: seedAgencies,
  users: seedUsers,
  properties: [
    ...propertiesFromInfrastructure(),
    ...seedProperties.filter((p) => !INFRA_PROPERTY_IDS.has(p.id) && p.id !== 'PR-1008'),
  ],
  buildings: seedBuildings,
  units: seedUnits,
  infraRooms: seedInfraRooms,
  internalAssets: seedInternalAssets,
  lookups: seedLookups,
  leads: seedLeads,
  applications: seedApplications,
  viewingSlots: seedViewingSlots,
  viewings: seedViewings,
  payments: seedPayments,
  tenancies: seedTenancies,
  threads: seedThreads,
  messages: seedMessages,
  notifications: seedNotifications,
  suiteAlerts: [
    ...buildDefaultSuiteAlerts(null),
    ...buildDefaultSuiteAlerts('ag-horizon'),
    ...buildDefaultSuiteAlerts('ag-cape'),
  ],
  tickets: seedTickets,
  activities: seedActivities,
  propertyDocuments: seedPropertyDocuments,
  propertyEvents: buildSeedPropertyEvents(),
  billingPlans: SEED_BILLING_PLANS,
  clientSubscriptions: SEED_SUBSCRIPTIONS,
  invoices: [],
  vendorRoutes: SEED_VENDOR_ROUTES,
})

function loadState(): AppState {
  const base = defaultState()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return base
    const parsed = JSON.parse(raw) as Partial<AppState>
    return {
      ...base,
      ...parsed,
      buildings: parsed.buildings?.length ? parsed.buildings : base.buildings,
      units: parsed.units?.length ? parsed.units : base.units,
      infraRooms: parsed.infraRooms?.length ? parsed.infraRooms : base.infraRooms,
      internalAssets: parsed.internalAssets?.length ? parsed.internalAssets : base.internalAssets,
      lookups: parsed.lookups?.length ? parsed.lookups : base.lookups,
      billingPlans: parsed.billingPlans?.length ? parsed.billingPlans : base.billingPlans,
      clientSubscriptions: parsed.clientSubscriptions?.length
        ? parsed.clientSubscriptions
        : base.clientSubscriptions,
      invoices: parsed.invoices ?? base.invoices,
      vendorRoutes: parsed.vendorRoutes?.length ? parsed.vendorRoutes : base.vendorRoutes,
      propertyDocuments: parsed.propertyDocuments?.length
        ? parsed.propertyDocuments
        : base.propertyDocuments,
      propertyEvents: parsed.propertyEvents?.length ? parsed.propertyEvents : base.propertyEvents,
      suiteAlerts: parsed.suiteAlerts?.length ? parsed.suiteAlerts : base.suiteAlerts,
      notifications: parsed.notifications ?? base.notifications,
    }
  } catch {
    return base
  }
}

const StoreContext = createContext<StoreContextValue | null>(null)

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(() => loadState())
  const [toasts, setToasts] = useState<NotificationToast[]>([])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

  const patch = useCallback((fn: (s: AppState) => AppState) => {
    setState((s) => fn(s))
  }, [])

  const pushToast = useCallback((toast: NotificationToast) => {
    setToasts((prev) => [toast, ...prev.filter((t) => t.notificationId !== toast.notificationId)].slice(0, 6))
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const addActivity = useCallback(
    (text: string, user: string, agencyId: string | null) => {
      const activity: Activity = {
        id: uid('act'),
        agencyId,
        text,
        user,
        at: new Date().toISOString(),
      }
      patch((s) => ({ ...s, activities: [activity, ...s.activities].slice(0, 200) }))
    },
    [patch],
  )

  const addPropertyEvent = useCallback(
    (input: Omit<PropertyEvent, 'id' | 'at'> & { at?: string }) => {
      const event: PropertyEvent = {
        ...input,
        id: uid('pe'),
        at: input.at ?? new Date().toISOString(),
      }
      patch((s) => ({
        ...s,
        propertyEvents: [event, ...s.propertyEvents].slice(0, 400),
      }))
      return event
    },
    [patch],
  )

  const notify = useCallback(
    (
      input: Omit<AppNotification, 'id' | 'at' | 'read'> & {
        read?: boolean
        silent?: boolean
        popupDurationMs?: number
      },
    ) => {
      const { silent, popupDurationMs, ...rest } = input
      const n: AppNotification = {
        ...rest,
        id: uid('N'),
        at: new Date().toISOString(),
        read: input.read ?? false,
      }
      patch((s) => ({ ...s, notifications: [n, ...s.notifications].slice(0, 300) }))
      if (!silent) {
        pushToast({
          id: uid('toast'),
          notificationId: n.id,
          userId: n.userId,
          title: n.title,
          body: n.body,
          link: n.link,
          durationMs: popupDurationMs ?? DEFAULT_POPUP_DURATION_MS,
          createdAt: Date.now(),
          action: n.action,
          tone: toastToneForAction(n.action),
        })
      }
      return n
    },
    [patch, pushToast],
  )

  const emitSuiteEvent = useCallback(
    (input: {
      agencyId: string | null
      resource: SuiteAlertResource
      action: SuiteAlertAction
      title: string
      body: string
      link?: string
      actorUserId?: string | null
      includeActor?: boolean
    }) => {
      const includeActor = input.includeActor !== false
      setState((s) => {
        const rule = resolveSuiteAlert(s.suiteAlerts, input.agencyId, input.resource, input.action)
        if (!rule) return s

        const recipients = s.users.filter((u) => {
          if (!u.active) return false
          if (!rule.notifyRoles.includes(u.role)) return false
          if (u.role !== 'super_admin' && input.agencyId && u.agencyId !== input.agencyId) return false
          if (!includeActor && input.actorUserId && u.id === input.actorUserId) return false
          return true
        })
        if (!recipients.length) return s

        const at = new Date().toISOString()
        const created: AppNotification[] = []
        const nextToasts: NotificationToast[] = []

        for (const user of recipients) {
          const n: AppNotification = {
            id: uid('N'),
            userId: user.id,
            agencyId: input.agencyId,
            title: input.title,
            body: input.body,
            at,
            read: false,
            link: input.link,
            resource: input.resource,
            action: input.action,
          }
          created.push(n)
          if (rule.popupEnabled) {
            nextToasts.push({
              id: uid('toast'),
              notificationId: n.id,
              userId: user.id,
              title: n.title,
              body: n.body,
              link: n.link,
              durationMs: rule.popupDurationMs || DEFAULT_POPUP_DURATION_MS,
              createdAt: Date.now(),
              action: input.action,
              tone: toastToneForAction(input.action),
            })
          }
        }

        if (nextToasts.length) {
          queueMicrotask(() => {
            setToasts((prev) => [...nextToasts, ...prev].slice(0, 6))
          })
        }

        return {
          ...s,
          notifications: [...created, ...s.notifications].slice(0, 300),
        }
      })
    },
    [],
  )

  const value = useMemo<StoreContextValue>(() => ({
    state,
    toasts,
    resetDemo: () => {
      localStorage.removeItem(STORAGE_KEY)
      setState(defaultState())
      setToasts([])
    },
    createAgency: (input) => {
      const agency: Agency = {
        id: uid('ag'),
        status: input.status ?? 'Active',
        createdAt: new Date().toISOString().slice(0, 10),
        name: input.name,
        slug: input.slug,
        city: input.city,
      }
      patch((s) => ({ ...s, agencies: [...s.agencies, agency] }))
      addActivity(`Agency created: ${agency.name}`, 'Super Admin', null)
      return agency
    },
    updateAgency: (id, p) => patch((s) => ({ ...s, agencies: s.agencies.map((a) => (a.id === id ? { ...a, ...p } : a)) })),
    createUser: (input) => {
      const user: AppUser = { ...input, id: uid('u'), active: input.active ?? true }
      patch((s) => ({ ...s, users: [...s.users, user] }))
      return user
    },
    updateUser: (id, p) => patch((s) => ({ ...s, users: s.users.map((u) => (u.id === id ? { ...u, ...p } : u)) })),
    assignRole: (userId, role, agencyId) =>
      patch((s) => ({
        ...s,
        users: s.users.map((u) =>
          u.id === userId ? { ...u, role, agencyId: agencyId === undefined ? u.agencyId : agencyId } : u,
        ),
      })),
    createProperty: (input) => {
      const property: PropertyAsset = {
        ...input,
        id: uid('PR'),
        createdAt: new Date().toISOString().slice(0, 10),
        images: input.images?.length ? input.images : [],
        rooms: input.rooms ?? [],
      }
      patch((s) => ({ ...s, properties: [property, ...s.properties] }))
      addActivity(`Asset created: ${property.title}`, 'Agent', property.agencyId)
      emitSuiteEvent({
        agencyId: property.agencyId,
        resource: 'property',
        action: 'created',
        title: 'Property created',
        body: `“${property.title}” was added to the portfolio.`,
        link: `/workspace/properties/${property.id}`,
      })
      return property
    },
    updateProperty: (id, p) => {
      const prev = state.properties.find((x) => x.id === id)
      patch((s) => {
        const current = s.properties.find((x) => x.id === id)
        const properties = s.properties.map((x) => (x.id === id ? { ...x, ...p } : x))
        if (!current) return { ...s, properties }
        const changes: PropertyEvent['changes'] = []
        if (p.status != null && p.status !== current.status) {
          changes.push({ field: 'Status', from: current.status, to: p.status })
        }
        if (p.title != null && p.title !== current.title) {
          changes.push({ field: 'Title', from: current.title, to: p.title })
        }
        if (p.featured != null && p.featured !== current.featured) {
          changes.push({
            field: 'Featured',
            from: current.featured ? 'Yes' : 'No',
            to: p.featured ? 'Yes' : 'No',
          })
        }
        if (!changes.length) return { ...s, properties }
        const event: PropertyEvent = {
          id: uid('pe'),
          agencyId: current.agencyId,
          propertyId: id,
          actorUserId: null,
          actorName: 'System',
          action: changes.length === 1 ? `changed the ${changes[0].field}` : 'updated the Property',
          at: new Date().toISOString(),
          changes,
        }
        return { ...s, properties, propertyEvents: [event, ...s.propertyEvents].slice(0, 400) }
      })
      if (prev) {
        emitSuiteEvent({
          agencyId: prev.agencyId,
          resource: 'property',
          action: 'updated',
          title: 'Property updated',
          body: `“${p.title ?? prev.title}” was changed.`,
          link: `/workspace/properties/${id}`,
        })
      }
    },
    setPropertyRooms: (id, rooms) => {
      const beds = rooms.reduce((n, r) => n + r.beds, 0)
      const baths = rooms.reduce((n, r) => n + r.baths, 0)
      patch((s) => ({
        ...s,
        properties: s.properties.map((x) => (x.id === id ? { ...x, rooms, beds, baths } : x)),
      }))
    },
    publishProperty: (id, status = 'Published') =>
      patch((s) => {
        const prev = s.properties.find((x) => x.id === id)
        if (!prev || prev.status === status) {
          return {
            ...s,
            properties: s.properties.map((x) => (x.id === id ? { ...x, status } : x)),
          }
        }
        const event: PropertyEvent = {
          id: uid('pe'),
          agencyId: prev.agencyId,
          propertyId: id,
          actorUserId: null,
          actorName: 'System',
          action: 'changed the Status',
          at: new Date().toISOString(),
          changes: [{ field: 'Status', from: prev.status, to: status }],
        }
        return {
          ...s,
          properties: s.properties.map((x) => (x.id === id ? { ...x, status } : x)),
          propertyEvents: [event, ...s.propertyEvents].slice(0, 400),
        }
      }),
    createBuilding: (input) => {
      const building: Building = {
        ...input,
        id: uid('bld'),
        images: input.images?.length ? input.images : [],
        createdAt: new Date().toISOString().slice(0, 10),
      }
      patch((s) => ({ ...s, buildings: [building, ...s.buildings] }))
      addActivity(`Building created: ${building.name}`, 'System', building.clientId)
      return building
    },
    createUnitFromTemplate: (input) => {
      const template = UNIT_TEMPLATES.find((t) => t.id === input.templateId) ?? UNIT_TEMPLATES[1]
      const building = state.buildings.find((b) => b.id === input.buildingId)
      const clientId = building?.clientId ?? 'ag-horizon'
      const unitId = uid('unt')
      const unit: Unit = {
        id: unitId,
        clientId,
        buildingId: input.buildingId,
        agentId: input.agentId,
        unitNumber: input.unitNumber,
        title: input.title,
        squareMeters: template.squareMeters,
        bedrooms: template.bedrooms,
        bathrooms: template.bathrooms,
        parking: template.parking,
        listingType: input.listingType,
        price: input.price,
        rent: input.rent,
        statusKey: 'DRAFT',
        description: template.blurb,
        amenities: ['Fibre'],
        images: building?.images ?? [],
        featured: false,
        lat: building?.lat,
        lng: building?.lng,
        createdAt: new Date().toISOString().slice(0, 10),
      }
      const rooms: InfraRoom[] = template.rooms.map((r) => ({
        id: uid('rm'),
        clientId,
        unitId,
        name: r.name,
        kind: r.kind,
        beds: r.beds,
        baths: r.baths,
        areaSqm: r.areaSqm,
        layout: r.layout,
      }))
      const assets: InternalAsset[] = template.starterAssets.map((a) => {
        const room = rooms.find((r) => r.name === a.roomName)
        return {
          id: uid('ia'),
          clientId,
          unitId,
          roomId: room?.id ?? null,
          itemName: a.itemName,
          assetTypeKey: a.assetTypeKey,
          brand: a.brand,
          condition: a.condition,
        }
      })
      patch((s) => ({
        ...s,
        units: [unit, ...s.units],
        infraRooms: [...rooms, ...s.infraRooms],
        internalAssets: [...assets, ...s.internalAssets],
      }))
      addActivity(`Unit ${unit.unitNumber} created from ${template.label}`, 'System', clientId)
      return unit
    },
    updateInternalAsset: (id, assetPatch) =>
      patch((s) => ({
        ...s,
        internalAssets: s.internalAssets.map((a) => (a.id === id ? { ...a, ...assetPatch } : a)),
      })),
    addInternalAsset: (input) => {
      const row: InternalAsset = { ...input, id: uid('ia') }
      patch((s) => ({ ...s, internalAssets: [row, ...s.internalAssets] }))
      emitSuiteEvent({
        agencyId: row.clientId,
        resource: 'inventory',
        action: 'created',
        title: 'Inventory item added',
        body: `“${row.itemName}” was added to inventory.`,
        link: '/workspace/properties',
      })
      return row
    },
    updateInfraRoom: (id, roomPatch) =>
      patch((s) => ({
        ...s,
        infraRooms: s.infraRooms.map((r) => (r.id === id ? { ...r, ...roomPatch } : r)),
      })),
    addInfraRoom: (input) => {
      const room: InfraRoom = {
        id: uid('rm'),
        clientId: input.clientId,
        unitId: input.unitId,
        name: input.name,
        kind: input.kind,
        beds: input.beds ?? 0,
        baths: input.baths ?? 0,
        areaSqm: input.areaSqm,
        color: input.color,
        layout: input.layout ?? { x: 10, y: 10, w: 28, h: 28 },
      }
      patch((s) => ({ ...s, infraRooms: [room, ...s.infraRooms] }))
      emitSuiteEvent({
        agencyId: room.clientId,
        resource: 'room',
        action: 'created',
        title: 'Floor plan room added',
        body: `“${room.name}” was added to the floor plan.`,
        link: '/workspace/properties',
      })
      return room
    },
    removeInfraRoom: (id) => {
      const room = state.infraRooms.find((r) => r.id === id)
      patch((s) => ({
        ...s,
        infraRooms: s.infraRooms.filter((r) => r.id !== id),
        internalAssets: s.internalAssets.map((a) =>
          a.roomId === id ? { ...a, roomId: null } : a,
        ),
      }))
      if (room) {
        emitSuiteEvent({
          agencyId: room.clientId,
          resource: 'room',
          action: 'deleted',
          title: 'Floor plan room deleted',
          body: `“${room.name}” was removed from the floor plan.`,
          link: '/workspace/properties',
        })
      }
    },
    removeInternalAsset: (id) => {
      const asset = state.internalAssets.find((a) => a.id === id)
      patch((s) => ({
        ...s,
        internalAssets: s.internalAssets.filter((a) => a.id !== id),
      }))
      if (asset) {
        emitSuiteEvent({
          agencyId: asset.clientId,
          resource: 'inventory',
          action: 'deleted',
          title: 'Inventory item deleted',
          body: `“${asset.itemName}” was removed from inventory.`,
          link: '/workspace/properties',
        })
      }
    },
    blockApplication: (id, reason) => {
      const app = state.applications.find((a) => a.id === id)
      if (!app) return
      const blockReason = (reason ?? '').trim() || 'Blocked by admin — no reason recorded.'

      setState((s) => {
        const current = s.applications.find((a) => a.id === id)
        if (!current) return s

        const cancelledIds = new Set(
          s.viewings
            .filter(
              (v) =>
                v.propertyId === current.propertyId &&
                v.status !== 'Cancelled' &&
                viewingBelongsToApplication(v, current),
            )
            .map((v) => v.id),
        )

        const slotDeltas = new Map<string, number>()
        for (const v of s.viewings) {
          if (!cancelledIds.has(v.id) || !v.slotId) continue
          slotDeltas.set(v.slotId, (slotDeltas.get(v.slotId) ?? 0) + 1)
        }

        return {
          ...s,
          applications: s.applications.map((a) =>
            a.id === id
              ? {
                  ...a,
                  stage: 'Blocked' as ApplicationStage,
                  progress: 0,
                  blockReason,
                  blockedAt: new Date().toISOString().slice(0, 10),
                  notes: a.notes
                    ? `${a.notes}\nBlocked: ${blockReason}`
                    : `Blocked: ${blockReason}`,
                  updatedAt: new Date().toISOString().slice(0, 10),
                }
              : a,
          ),
          viewings: s.viewings.map((v) =>
            cancelledIds.has(v.id) ? { ...v, status: 'Cancelled' as const } : v,
          ),
          viewingSlots: s.viewingSlots.map((slot) => {
            const freed = slotDeltas.get(slot.id) ?? 0
            if (!freed) return slot
            const booked = Math.max(0, slot.booked - freed)
            return {
              ...slot,
              booked,
              status:
                slot.status === 'Full' && booked < slot.capacity ? ('Open' as const) : slot.status,
            }
          }),
        }
      })

      emitSuiteEvent({
        agencyId: app.agencyId,
        resource: 'applicant',
        action: 'updated',
        title: 'Applicant blocked',
        body: `${app.applicantName} was blocked: ${blockReason}`,
        link: `/workspace/sales/applications/${app.id}?tab=blocks`,
      })

      if (app.applicantUserId) {
        notify({
          userId: app.applicantUserId,
          agencyId: app.agencyId,
          title: 'Application blocked',
          body: `Your application was blocked. Reason: ${blockReason}`,
          link: '/workspace/portals/tenant',
        })
      }
    },
    addPropertyDocument: (input) => {
      const doc: PropertyDocument = { ...input, id: uid('PD') }
      patch((s) => ({ ...s, propertyDocuments: [doc, ...s.propertyDocuments] }))
      addPropertyEvent({
        agencyId: doc.agencyId,
        propertyId: doc.propertyId,
        actorUserId: null,
        actorName: 'System',
        action: 'added a Document',
        changes: [{ field: 'Document', from: 'None', to: doc.name }],
      })
      return doc
    },
    updatePropertyDocument: (id, docPatch) =>
      patch((s) => ({
        ...s,
        propertyDocuments: s.propertyDocuments.map((d) => (d.id === id ? { ...d, ...docPatch } : d)),
      })),
    removePropertyDocument: (id) =>
      patch((s) => ({
        ...s,
        propertyDocuments: s.propertyDocuments.filter((d) => d.id !== id),
      })),
    addPropertyEvent,
    createLead: (input) => {
      const lead: Lead = {
        ...input,
        id: uid('LD'),
        stage: input.stage ?? 'New Lead',
        notes: input.notes ?? '',
        createdAt: new Date().toISOString().slice(0, 10),
        updatedAt: new Date().toISOString().slice(0, 10),
      }
      patch((s) => ({ ...s, leads: [lead, ...s.leads] }))
      return lead
    },
    updateLeadStage: (id, stage) =>
      patch((s) => ({
        ...s,
        leads: s.leads.map((l) => (l.id === id ? { ...l, stage, updatedAt: new Date().toISOString().slice(0, 10) } : l)),
      })),
    createApplication: (input) => {
      const property = state.properties.find((p) => p.id === input.propertyId)
      const unit = resolveUnitForProperty(property, state.units)

      if (
        isApplicantBlockedOnProperty(state.applications, input.propertyId, {
          userId: input.applicantUserId,
          email: input.email,
          name: input.applicantName,
        })
      ) {
        return {
          status: 'ERROR',
          error: 'You are blocked from applying to this property.',
          httpStatus: 422,
        } as SubmitApplicationResult
      }

      if (!input.skipGuards) {
        const check = validateApplicationSubmission({
          unit,
          property,
          request: {
            unit_id: unit?.id ?? input.propertyId,
            application_type: fromDomainApplicationType(input.type),
            monthly_income_declared: input.income ?? 0,
            id_number_or_passport: input.idNumberOrPassport ?? '',
            uploaded_docs: {
              bank_statements_url: input.uploadedDocs?.bankStatementsUrl,
              id_copy_url: input.uploadedDocs?.idCopyUrl,
              payslip_url: input.uploadedDocs?.payslipUrl,
            },
          },
        })
        if (check.status === 'ERROR') return check
      }

      const documents = buildDocumentChecklist(input.type)
      const app: Application = {
        id: uid('APP'),
        agencyId: input.agencyId,
        propertyId: input.propertyId,
        unitId: unit?.id ?? property?.unitId ?? null,
        agentId: input.agentId,
        applicantUserId: input.applicantUserId ?? null,
        applicantName: input.applicantName,
        email: input.email,
        phone: input.phone,
        type: input.type,
        stage: 'Documents Pending',
        progress: STAGE_PROGRESS['Documents Pending'],
        income: input.income ?? 0,
        employment: input.employment ?? 'To be completed',
        idNumberOrPassport: input.idNumberOrPassport,
        uploadedDocs: input.uploadedDocs,
        creditCheck: 'Not Started',
        creditConsent: false,
        documents,
        docs: [],
        viewingSlotId: null,
        notes: '',
        submittedAt: new Date().toISOString().slice(0, 10),
        updatedAt: new Date().toISOString().slice(0, 10),
      }
      patch((s) => ({ ...s, applications: [app, ...s.applications] }))
      addActivity(`Application started: ${app.applicantName}`, app.applicantName, app.agencyId)

      // Real-time alert to agency staff (demo: notify client_admin / agent_admin)
      const recipients = state.users.filter(
        (u) =>
          u.agencyId === input.agencyId &&
          u.active &&
          (u.role === 'client_admin' || u.role === 'agent_admin' || u.role === 'agent'),
      )
      recipients.slice(0, 3).forEach((u) => {
        notify({
          userId: u.id,
          agencyId: input.agencyId,
          title: 'New application',
          body: `New ${input.type.toLowerCase()} application for ${property?.title ?? input.propertyId} from ${input.applicantName}.`,
          link: '/workspace/sales/applications',
        })
      })

      return app
    },
    updateApplication: (id, p) => {
      const prev = state.applications.find((a) => a.id === id)
      patch((s) => ({
        ...s,
        applications: s.applications.map((a) =>
          a.id === id ? { ...a, ...p, updatedAt: new Date().toISOString().slice(0, 10) } : a,
        ),
      }))
      if (prev && p.stage && p.stage !== prev.stage) {
        emitSuiteEvent({
          agencyId: prev.agencyId,
          resource: 'applicant',
          action: 'updated',
          title: 'Applicant stage changed',
          body: `${prev.applicantName}: ${prev.stage} → ${p.stage}`,
          link: `/workspace/properties/${prev.propertyId}?tab=applicants`,
        })
      }
    },
    setDocumentStatus: (applicationId, key, status, note) => {
      patch((s) => ({
        ...s,
        applications: s.applications.map((a) => {
          if (a.id !== applicationId) return a
          const documents = a.documents.map((d) =>
            d.key === key ? { ...d, status, ...(note !== undefined ? { note } : {}) } : d,
          )
          const uploaded = allDocsUploaded(documents)
          const stage: ApplicationStage =
            uploaded && ['Started', 'Documents Pending'].includes(a.stage) ? 'Documents Submitted' : a.stage
          return {
            ...a,
            documents,
            docs: documents.filter((d) => d.status !== 'required').map((d) => d.label),
            stage,
            progress: STAGE_PROGRESS[stage],
            creditConsent: key === 'credit_consent' && status !== 'required' ? true : a.creditConsent,
            creditCheck: key === 'credit_consent' && status !== 'required' ? 'Consent Received' : a.creditCheck,
            updatedAt: new Date().toISOString().slice(0, 10),
          }
        }),
      }))
    },
    advanceApplication: (id, to) => {
      patch((s) => ({
        ...s,
        applications: s.applications.map((a) => {
          if (a.id !== id) return a
          const stage = to ?? a.stage
          return { ...a, stage, progress: STAGE_PROGRESS[stage] ?? a.progress, updatedAt: new Date().toISOString().slice(0, 10) }
        }),
      }))
    },
    approveApplication: (id) => {
      const app = state.applications.find((a) => a.id === id)
      const actorUser =
        state.users.find(
          (u) =>
            u.agencyId === app?.agencyId &&
            (u.role === 'client_admin' || u.role === 'agent_admin'),
        ) ?? state.users.find((u) => u.role === 'super_admin')

      let result: PatchApplicationStatusResult = {
        status: 'ERROR',
        httpStatus: 404,
        error: 'Application not found',
        code: 'NOT_FOUND',
      }

      setState((s) => {
        const current = s.applications.find((a) => a.id === id)
        const actor = s.users.find((u) => u.id === (actorUser?.id ?? ''))
        const property = current ? s.properties.find((p) => p.id === current.propertyId) : undefined
        const unitId = current?.unitId ?? property?.unitId ?? null
        const unit = unitId ? s.units.find((u) => u.id === unitId) : undefined
        const building = unit
          ? s.buildings.find((b) => b.id === unit.buildingId)
          : property?.buildingId
            ? s.buildings.find((b) => b.id === property.buildingId)
            : undefined

        result = patchApplicationStatus({
          application: current,
          property,
          unit,
          building,
          viewings: s.viewings,
          slots: s.viewingSlots,
          existingTenancies: s.tenancies,
          request: { status: 'APPROVED', payment_provider: 'auto' },
          actor: {
            userId: actorUser?.id ?? 'system',
            role: actor?.role ?? ('client_admin' as Role),
            agencyId: actor?.agencyId ?? current?.agencyId ?? null,
            permissions: rolePermissions[actor?.role ?? 'client_admin'] ?? [],
          },
        })

        if (result.status === 'ERROR') return s
        const ok = result
        const notifications: AppNotification[] = []
        if (current?.applicantUserId) {
          notifications.push({
            id: uid('N'),
            userId: current.applicantUserId,
            agencyId: current.agencyId,
            title: 'Application approved',
            body: `Checkout ready via ${ok.checkout?.provider ?? 'PayFast'}. Pay deposit to proceed.`,
            at: new Date().toISOString(),
            read: false,
            link: '/workspace/portals/tenant',
          })
        }

        return {
          ...s,
          applications: s.applications.map((a) => (a.id === id ? ok.application : a)),
          payments: [...ok.side_effects.payments, ...s.payments],
          tenancies: ok.side_effects.lease ? [ok.side_effects.lease, ...s.tenancies] : s.tenancies,
          units:
            ok.side_effects.unit_id && ok.side_effects.unit_status
              ? s.units.map((u) =>
                  u.id === ok.side_effects.unit_id
                    ? { ...u, statusKey: ok.side_effects.unit_status! }
                    : u,
                )
              : s.units,
          properties: current
            ? s.properties.map((p) =>
                p.id === current.propertyId && current.type === 'Rental'
                  ? { ...p, status: 'Rented' as const }
                  : p.id === current.propertyId && current.type === 'Purchase'
                    ? { ...p, status: 'Under Offer' as const }
                    : p,
              )
            : s.properties,
          viewingSlots: s.viewingSlots.map((slot) =>
            ok.side_effects.cancelled_slot_ids.includes(slot.id)
              ? { ...slot, status: 'Cancelled' as const }
              : slot,
          ),
          viewings: s.viewings.map((v) =>
            ok.side_effects.cancelled_viewing_ids.includes(v.id)
              ? { ...v, status: 'Cancelled' as const }
              : v,
          ),
          notifications: [...notifications, ...s.notifications],
          activities: [
            {
              id: uid('act'),
              agencyId: current?.agencyId ?? null,
              text:
                ok.layout.headline +
                (ok.checkout ? ` · ${ok.checkout.provider} checkout ${ok.checkout.payment_id}` : ''),
              user: actor?.name ?? 'Agency',
              at: new Date().toISOString(),
            },
            ...s.activities,
          ],
        }
      })

      return result
    },
    patchApplicationStatus: ({ applicationId, actorUserId, request }) => {
      let result: PatchApplicationStatusResult = {
        status: 'ERROR',
        httpStatus: 404,
        error: 'Application not found',
        code: 'NOT_FOUND',
      }

      setState((s) => {
        const app = s.applications.find((a) => a.id === applicationId)
        const actorUser = s.users.find((u) => u.id === actorUserId)
        const property = app ? s.properties.find((p) => p.id === app.propertyId) : undefined
        const unitId = app?.unitId ?? property?.unitId ?? null
        const unit = unitId ? s.units.find((u) => u.id === unitId) : undefined
        const building = unit
          ? s.buildings.find((b) => b.id === unit.buildingId)
          : property?.buildingId
            ? s.buildings.find((b) => b.id === property.buildingId)
            : undefined

        const actor = {
          userId: actorUserId,
          role: actorUser?.role ?? ('client_admin' as Role),
          agencyId: actorUser?.agencyId ?? app?.agencyId ?? null,
          permissions: rolePermissions[actorUser?.role ?? 'client_admin'] ?? [],
        }

        result = patchApplicationStatus({
          application: app,
          property,
          unit,
          building,
          viewings: s.viewings,
          slots: s.viewingSlots,
          existingTenancies: s.tenancies,
          request,
          actor,
        })

        if (result.status === 'ERROR') return s

        const ok = result
        const notifications: AppNotification[] = []
        if (ok.api_status === 'APPROVED' && app?.applicantUserId) {
          notifications.push({
            id: uid('N'),
            userId: app.applicantUserId,
            agencyId: app.agencyId,
            title: 'Application approved',
            body: `Checkout ready via ${ok.checkout?.provider ?? 'PayFast'}. Pay deposit to proceed.`,
            at: new Date().toISOString(),
            read: false,
            link: '/workspace/portals/tenant',
          })
        }

        return {
          ...s,
          applications: s.applications.map((a) => (a.id === applicationId ? ok.application : a)),
          payments: ok.side_effects.payments.length
            ? [...ok.side_effects.payments, ...s.payments]
            : s.payments,
          tenancies: ok.side_effects.lease
            ? [ok.side_effects.lease, ...s.tenancies]
            : s.tenancies,
          units:
            ok.side_effects.unit_id && ok.side_effects.unit_status
              ? s.units.map((u) =>
                  u.id === ok.side_effects.unit_id
                    ? { ...u, statusKey: ok.side_effects.unit_status! }
                    : u,
                )
              : s.units,
          properties: app
            ? s.properties.map((p) =>
                p.id === app.propertyId && app.type === 'Rental' && ok.api_status === 'APPROVED'
                  ? { ...p, status: 'Rented' as const }
                  : p.id === app.propertyId && app.type === 'Purchase' && ok.api_status === 'APPROVED'
                    ? { ...p, status: 'Under Offer' as const }
                    : p,
              )
            : s.properties,
          viewingSlots: s.viewingSlots.map((slot) =>
            ok.side_effects.cancelled_slot_ids.includes(slot.id)
              ? { ...slot, status: 'Cancelled' as const }
              : slot,
          ),
          viewings: s.viewings.map((v) =>
            ok.side_effects.cancelled_viewing_ids.includes(v.id)
              ? { ...v, status: 'Cancelled' as const }
              : v,
          ),
          notifications: [...notifications, ...s.notifications],
          activities: [
            {
              id: uid('act'),
              agencyId: app?.agencyId ?? null,
              text:
                ok.layout.headline +
                (ok.checkout ? ` · ${ok.checkout.provider} checkout ${ok.checkout.payment_id}` : ''),
              user: actorUser?.name ?? 'Agency',
              at: new Date().toISOString(),
            },
            ...s.activities,
          ],
        }
      })

      return result
    },
    scheduleMoveIn: (id, moveInDate, keyCollection) => {
      setState((s) => {
        const app = s.applications.find((a) => a.id === id)
        if (!app) return s
        const withEmail = { ...keyCollection, emailSentAt: new Date().toISOString() }
        const notifications: AppNotification[] = []
        if (app.applicantUserId) {
          notifications.push({
            id: uid('N'),
            userId: app.applicantUserId,
            agencyId: app.agencyId,
            title: 'Move-in & key collection',
            body: `Collect keys at ${keyCollection.location} on ${moveInDate}. ${keyCollection.instructions}`,
            at: new Date().toISOString(),
            read: false,
            link: '/workspace/portals/tenant',
          })
        }
        return {
          ...s,
          applications: s.applications.map((a) =>
            a.id === id
              ? {
                  ...a,
                  stage: 'Move-In Scheduled' as ApplicationStage,
                  progress: STAGE_PROGRESS['Move-In Scheduled'],
                  moveInDate,
                  keyCollection: withEmail,
                  updatedAt: new Date().toISOString().slice(0, 10),
                }
              : a,
          ),
          notifications: [...notifications, ...s.notifications],
          activities: [
            {
              id: uid('act'),
              agencyId: app.agencyId,
              text: `Key handover email sent to ${app.applicantName}`,
              user: 'System',
              at: new Date().toISOString(),
            },
            ...s.activities,
          ],
        }
      })
    },
    completeKeyHandover: (id) => {
      setState((s) => {
        const app = s.applications.find((a) => a.id === id)
        if (!app) return s
        const prop = s.properties.find((p) => p.id === app.propertyId)
        const existing = s.tenancies.find((t) => t.applicationId === app.id)
        const tenancy: Tenancy = existing
          ? {
              ...existing,
              status: 'Active',
              startDate: app.moveInDate ?? existing.startDate,
              keyCollection: app.keyCollection ?? existing.keyCollection,
            }
          : {
              id: uid('TN'),
              agencyId: app.agencyId,
              propertyId: app.propertyId,
              landlordId: prop?.landlordId ?? '',
              agentId: app.agentId,
              applicationId: app.id,
              tenantUserId: app.applicantUserId,
              tenantName: app.applicantName,
              tenantEmail: app.email,
              startDate: app.moveInDate ?? new Date().toISOString().slice(0, 10),
              endDate: null,
              rent: prop?.rent ?? 0,
              deposit: (prop?.rent ?? 0) * 2,
              status: 'Active',
              keyCollection: app.keyCollection ?? {
                location: 'Agency office',
                instructions: 'Collect from reception',
                contactName: 'Agent',
                contactPhone: '',
              },
            }
        return {
          ...s,
          applications: s.applications.map((a) =>
            a.id === id
              ? {
                  ...a,
                  stage: 'Active Tenancy' as ApplicationStage,
                  progress: 100,
                  updatedAt: new Date().toISOString().slice(0, 10),
                }
              : a,
          ),
          tenancies: existing
            ? s.tenancies.map((t) => (t.id === existing.id ? tenancy : t))
            : [tenancy, ...s.tenancies],
          properties: s.properties.map((p) =>
            p.id === app.propertyId && app.type === 'Rental' ? { ...p, status: 'Rented' as const } : p,
          ),
          activities: [
            {
              id: uid('act'),
              agencyId: app.agencyId,
              text: `Keys handed over — ${app.applicantName} is now an active occupant`,
              user: 'Agency',
              at: new Date().toISOString(),
            },
            ...s.activities,
          ],
        }
      })
    },
    createViewingSlot: (input) => {
      if (!input.propertyId) {
        throw new Error('Viewing slots must be linked to a property.')
      }
      const slot: ViewingSlot = {
        ...input,
        id: uid('VS'),
        propertyId: input.propertyId,
        capacity: input.capacity ?? 3,
        booked: 0,
        status: 'Open',
      }
      patch((s) => ({ ...s, viewingSlots: [slot, ...s.viewingSlots] }))
      addPropertyEvent({
        agencyId: slot.agencyId,
        propertyId: slot.propertyId,
        actorUserId: slot.agentId,
        actorName: actorNameFromState(state, slot.agentId, 'Agent'),
        action: 'published a Viewing slot',
        changes: [
          { field: 'Date', from: 'None', to: slot.date },
          { field: 'Time', from: 'None', to: slot.time },
        ],
      })
      emitSuiteEvent({
        agencyId: slot.agencyId,
        resource: 'viewing_slot',
        action: 'created',
        title: 'Viewing slot published',
        body: `${slot.title?.trim() || 'Viewing'} · ${slot.date} ${slot.time}`,
        link: `/workspace/sales/viewings/property/${slot.propertyId}`,
      })
      return slot
    },
    updateViewingSlot: (id, p) => {
      const prev = state.viewingSlots.find((slot) => slot.id === id)
      patch((s) => ({
        ...s,
        viewingSlots: s.viewingSlots.map((slot) => (slot.id === id ? { ...slot, ...p } : slot)),
      }))
      if (prev && p.status && p.status !== prev.status) {
        emitSuiteEvent({
          agencyId: prev.agencyId,
          resource: 'viewing_slot',
          action: 'updated',
          title: p.status === 'Cancelled' ? 'Viewing slot cancelled' : 'Viewing slot updated',
          body: `${prev.title?.trim() || 'Viewing'} is now ${p.status}.`,
          link: `/workspace/sales/viewings/property/${prev.propertyId}`,
        })
      }
    },
    removeViewing: (id) => {
      const viewing = state.viewings.find((v) => v.id === id)
      setState((s) => {
        const row = s.viewings.find((v) => v.id === id)
        if (!row) return s
        let viewingSlots = s.viewingSlots
        if (row.slotId) {
          viewingSlots = viewingSlots.map((slot) => {
            if (slot.id !== row.slotId) return slot
            const booked = Math.max(0, slot.booked - 1)
            return {
              ...slot,
              booked,
              status: slot.status === 'Full' && booked < slot.capacity ? ('Open' as const) : slot.status,
            }
          })
        }
        return {
          ...s,
          viewings: s.viewings.filter((v) => v.id !== id),
          viewingSlots,
        }
      })
      if (viewing) {
        emitSuiteEvent({
          agencyId: viewing.agencyId,
          resource: 'viewing',
          action: 'deleted',
          title: 'Viewing booking deleted',
          body: `${viewing.applicantName} was removed from a viewing.`,
          link: `/workspace/sales/viewings/property/${viewing.propertyId}`,
        })
      }
    },
    removeViewingSlot: (id) => {
      const slot = state.viewingSlots.find((s) => s.id === id)
      patch((s) => ({
        ...s,
        viewingSlots: s.viewingSlots.filter((row) => row.id !== id),
        viewings: s.viewings.map((v) =>
          v.slotId === id ? { ...v, slotId: null, status: 'Cancelled' as const } : v,
        ),
      }))
      if (slot) {
        emitSuiteEvent({
          agencyId: slot.agencyId,
          resource: 'viewing_slot',
          action: 'deleted',
          title: 'Viewing slot deleted',
          body: `${slot.title?.trim() || `${slot.date} ${slot.time}`} was deleted.`,
          link: `/workspace/sales/viewings/property/${slot.propertyId}`,
        })
      }
    },
    transferViewingSlot: (fromSlotId, toSlotId) => {
      let ok = false
      let agencyId: string | null = null
      let propertyId = ''
      setState((s) => {
        const from = s.viewingSlots.find((slot) => slot.id === fromSlotId)
        const to = s.viewingSlots.find((slot) => slot.id === toSlotId)
        if (!from || !to || from.propertyId !== to.propertyId || to.status === 'Cancelled') return s
        const movers = s.viewings.filter(
          (v) => v.slotId === fromSlotId && v.status !== 'Cancelled',
        )
        if (!movers.length) return s
        const space = to.capacity - to.booked
        if (space < movers.length) return s
        ok = true
        agencyId = from.agencyId
        propertyId = from.propertyId
        const moverIds = new Set(movers.map((m) => m.id))
        return {
          ...s,
          viewings: s.viewings.map((v) =>
            moverIds.has(v.id)
              ? { ...v, slotId: toSlotId, date: to.date, time: to.time, agentId: to.agentId }
              : v,
          ),
          viewingSlots: s.viewingSlots.map((slot) => {
            if (slot.id === fromSlotId) {
              return { ...slot, booked: 0, status: 'Cancelled' as const }
            }
            if (slot.id === toSlotId) {
              const booked = slot.booked + movers.length
              return {
                ...slot,
                booked,
                status: booked >= slot.capacity ? ('Full' as const) : slot.status,
              }
            }
            return slot
          }),
        }
      })
      if (ok) {
        emitSuiteEvent({
          agencyId,
          resource: 'viewing_slot',
          action: 'updated',
          title: 'Viewing slot transferred',
          body: 'Attendees were moved to another viewing slot.',
          link: propertyId
            ? `/workspace/sales/viewings/property/${propertyId}`
            : '/workspace/sales/viewings',
        })
      }
      return ok
    },
    bookViewingSlot: (slotId, applicantName, applicantEmail, applicationId) => {
      let created: Viewing | null = null
      setState((s) => {
        const slot = s.viewingSlots.find((x) => x.id === slotId)
        if (!slot || slot.status !== 'Open' || slot.booked >= slot.capacity) return s

        if (
          isApplicantBlockedOnProperty(s.applications, slot.propertyId, {
            email: applicantEmail,
            name: applicantName,
          })
        ) {
          return s
        }
        if (applicationId) {
          const app = s.applications.find((a) => a.id === applicationId)
          if (!app || app.stage === 'Blocked' || app.propertyId !== slot.propertyId) return s
        }

        const booked = slot.booked + 1
        created = {
          id: uid('VW'),
          agencyId: slot.agencyId,
          propertyId: slot.propertyId,
          agentId: slot.agentId,
          slotId: slot.id,
          applicantName,
          applicantEmail,
          date: slot.date,
          time: slot.time,
          status: 'Scheduled',
          attendance: '—',
        }
        return {
          ...s,
          viewingSlots: s.viewingSlots.map((x) =>
            x.id === slotId
              ? { ...x, booked, status: booked >= x.capacity ? ('Full' as const) : x.status }
              : x,
          ),
          viewings: [created!, ...s.viewings],
          applications: applicationId
            ? s.applications.map((a) =>
                a.id === applicationId
                  ? {
                      ...a,
                      viewingSlotId: slotId,
                      stage: 'Viewing Booked' as ApplicationStage,
                      progress: STAGE_PROGRESS['Viewing Booked'],
                      updatedAt: new Date().toISOString().slice(0, 10),
                    }
                  : a,
              )
            : s.applications,
        }
      })
      return created
    },
    createViewing: (input) => {
      const viewing: Viewing = {
        status: 'Scheduled',
        attendance: '—',
        slotId: null,
        ...input,
        id: uid('VW'),
      }
      patch((s) => ({ ...s, viewings: [viewing, ...s.viewings] }))
      addPropertyEvent({
        agencyId: viewing.agencyId,
        propertyId: viewing.propertyId,
        actorUserId: viewing.agentId,
        actorName: actorNameFromState(state, viewing.agentId, 'Agent'),
        action: 'scheduled a Viewing',
        changes: [
          { field: 'Applicant', from: 'None', to: viewing.applicantName },
          { field: 'Status', from: 'None', to: viewing.status },
        ],
      })
      return viewing
    },
    updateViewing: (id, p) =>
      patch((s) => {
        const prev = s.viewings.find((v) => v.id === id)
        const viewings = s.viewings.map((v) => (v.id === id ? { ...v, ...p } : v))
        if (!prev || !p.status || p.status === prev.status) return { ...s, viewings }
        const event: PropertyEvent = {
          id: uid('pe'),
          agencyId: prev.agencyId,
          propertyId: prev.propertyId,
          actorUserId: prev.agentId,
          actorName: actorNameFromState(s, prev.agentId, 'Agent'),
          action: 'changed the Viewing status',
          at: new Date().toISOString(),
          changes: [{ field: 'Status', from: prev.status, to: p.status }],
        }
        return { ...s, viewings, propertyEvents: [event, ...s.propertyEvents].slice(0, 400) }
      }),
    createPayment: (input) => {
      const payment: PaymentRecord = {
        status: 'Due',
        paidAt: null,
        method: null,
        ...input,
        id: uid('PAY'),
      }
      patch((s) => ({ ...s, payments: [payment, ...s.payments] }))
      addPropertyEvent({
        agencyId: payment.agencyId,
        propertyId: payment.propertyId,
        actorUserId: payment.partyUserId,
        actorName: payment.partyName,
        action: 'created a Payment due',
        changes: [
          { field: 'Type', from: 'None', to: payment.type },
          { field: 'Status', from: 'None', to: payment.status },
        ],
      })
      emitSuiteEvent({
        agencyId: payment.agencyId,
        resource: 'payment',
        action: 'created',
        title: 'Payment recorded',
        body: `${payment.type} · ${payment.partyName} is due.`,
        link: `/workspace/properties/${payment.propertyId}?tab=payments`,
      })
      return payment
    },
    markPaymentPaid: (id, details = 'EFT') => {
      const opts: MarkPaymentPaidDetails =
        typeof details === 'string' ? { method: details } : (details ?? { method: 'EFT' })
      const method = opts.method ?? 'EFT'
      const paidAt = opts.paidAt ?? new Date().toISOString().slice(0, 10)
      const before = state.payments.find((p) => p.id === id)
      setState((s) => {
        const payment = s.payments.find((p) => p.id === id)
        if (!payment) return s
        const payments = s.payments.map((p) =>
          p.id === id
            ? {
                ...p,
                status: 'Paid' as const,
                paidAt,
                method,
                reference: opts.reference ?? p.reference ?? null,
                paidAmount: opts.paidAmount ?? p.amount,
                notes: opts.notes ?? p.notes ?? null,
                attachments: opts.attachments ?? p.attachments ?? [],
                recordedByUserId: opts.recordedByUserId ?? p.recordedByUserId ?? null,
                recordedByName: opts.recordedByName ?? p.recordedByName ?? null,
              }
            : p,
        )
        let applications = s.applications
        if (payment.applicationId) {
          const related = payments.filter((p) => p.applicationId === payment.applicationId)
          const dues = related.filter((p) => p.status === 'Due' || p.status === 'Overdue')
          if (dues.length === 0) {
            applications = applications.map((a) =>
              a.id === payment.applicationId
                ? {
                    ...a,
                    stage: 'Deposit Paid' as ApplicationStage,
                    progress: STAGE_PROGRESS['Deposit Paid'],
                    updatedAt: new Date().toISOString().slice(0, 10),
                  }
                : a,
            )
          }
        }
        const event: PropertyEvent = {
          id: uid('pe'),
          agencyId: payment.agencyId,
          propertyId: payment.propertyId,
          actorUserId: payment.partyUserId,
          actorName: payment.partyName,
          action: 'marked a Payment as Paid',
          at: new Date().toISOString(),
          changes: [{ field: 'Status', from: payment.status, to: 'Paid' }],
        }
        return {
          ...s,
          payments,
          applications,
          propertyEvents: [event, ...s.propertyEvents].slice(0, 400),
        }
      })
      if (before) {
        emitSuiteEvent({
          agencyId: before.agencyId,
          resource: 'payment',
          action: 'updated',
          title: 'Payment marked paid',
          body: `${before.type} · ${before.partyName} was marked paid.`,
          link: `/workspace/properties/${before.propertyId}?tab=payments`,
        })
      }
    },
    removePayment: (id) => {
      const payment = state.payments.find((p) => p.id === id)
      if (!payment || (payment.status !== 'Due' && payment.status !== 'Overdue')) return false
      patch((s) => ({
        ...s,
        payments: s.payments.filter((p) => p.id !== id),
      }))
      emitSuiteEvent({
        agencyId: payment.agencyId,
        resource: 'payment',
        action: 'deleted',
        title: 'Unpaid payment deleted',
        body: `${payment.type} · ${payment.partyName} was removed.`,
        link: `/workspace/properties/${payment.propertyId}?tab=payments`,
      })
      return true
    },
    updatePayment: (id, p) => {
      const before = state.payments.find((x) => x.id === id)
      if (!before) return
      patch((s) => ({
        ...s,
        payments: s.payments.map((pay) => (pay.id === id ? { ...pay, ...p } : pay)),
      }))
      if (p.status && p.status !== before.status) {
        addPropertyEvent({
          agencyId: before.agencyId,
          propertyId: before.propertyId,
          actorUserId: before.partyUserId,
          actorName: before.partyName,
          action: 'updated a Payment status',
          changes: [{ field: 'Status', from: before.status, to: p.status }],
        })
        emitSuiteEvent({
          agencyId: before.agencyId,
          resource: 'payment',
          action: 'updated',
          title: 'Payment updated',
          body: `${before.type} · ${before.partyName} → ${p.status}.`,
          link: `/workspace/properties/${before.propertyId}?tab=payments`,
        })
      }
    },
    createThread: (input) => {
      const thread: MessageThread = {
        id: uid('TH'),
        agencyId: input.agencyId,
        propertyId: input.propertyId,
        applicationId: input.applicationId,
        subject: input.subject,
        participantIds: input.participantIds,
        routesTo: input.routesTo,
        updatedAt: new Date().toISOString(),
      }
      const message: Message = {
        id: uid('MSG'),
        threadId: thread.id,
        agencyId: input.agencyId,
        fromUserId: input.fromUserId,
        body: input.initialMessage,
        at: new Date().toISOString(),
      }
      patch((s) => ({
        ...s,
        threads: [thread, ...s.threads],
        messages: [message, ...s.messages],
      }))
      return thread
    },
    sendMessage: (threadId, fromUserId, body) => {
      const message: Message = {
        id: uid('MSG'),
        threadId,
        agencyId: state.threads.find((t) => t.id === threadId)?.agencyId ?? '',
        fromUserId,
        body,
        at: new Date().toISOString(),
      }
      patch((s) => ({
        ...s,
        messages: [...s.messages, message],
        threads: s.threads.map((t) => (t.id === threadId ? { ...t, updatedAt: message.at } : t)),
      }))
      const thread = state.threads.find((t) => t.id === threadId)
      if (thread) {
        emitSuiteEvent({
          agencyId: thread.agencyId,
          resource: 'message',
          action: 'created',
          title: 'New message',
          body: body.slice(0, 120) || 'A message was sent.',
          link: thread.propertyId
            ? `/workspace/properties/${thread.propertyId}?tab=messages`
            : '/workspace/operations/communications',
          actorUserId: fromUserId,
        })
      }
      return message
    },
    createTicket: (input) => {
      const prop = state.properties.find((p) => p.id === input.propertyId)
      const unitId = input.unitId ?? prop?.unitId ?? null
      const asset = input.internalAssetId
        ? state.internalAssets.find((a) => a.id === input.internalAssetId)
        : undefined
      const categoryKey = input.categoryKey ?? 'GENERAL'
      const warrantyCovered = input.warrantyCovered ?? isWarrantyCovered(asset)
      const contractorId =
        input.contractorId ??
        resolvePreferredVendor(state.vendorRoutes, input.agencyId, categoryKey)
      const ticket: MaintenanceTicket = {
        status: 'Requested',
        cost: 0,
        photos: input.photos ?? 0,
        assignedAgentId: input.assignedAgentId ?? prop?.agentId ?? null,
        reportedByUserId: input.reportedByUserId ?? null,
        unitId,
        internalAssetId: input.internalAssetId ?? null,
        categoryKey,
        escalatedAt: null,
        openedAtIso: new Date().toISOString(),
        ...input,
        id: uid('MT'),
        openedAt: new Date().toISOString().slice(0, 10),
        contractorId,
        warrantyCovered,
      }
      patch((s) => ({ ...s, tickets: [ticket, ...s.tickets] }))
      addActivity(
        `Maintenance: ${ticket.title}${warrantyCovered ? ' (warranty)' : ''} → ${contractorId ? 'vendor routed' : 'agency queue'}`,
        'Portal',
        ticket.agencyId,
      )
      addPropertyEvent({
        agencyId: ticket.agencyId,
        propertyId: ticket.propertyId,
        actorUserId: ticket.reportedByUserId,
        actorName: ticket.reportedBy,
        action: 'created maintenance',
        changes: [
          { field: 'Priority', from: 'None', to: ticket.priority },
          { field: 'Status', from: 'None', to: ticket.status },
        ],
      })
      if (ticket.priority === 'Emergency') {
        const managers = state.users.filter(
          (u) => u.agencyId === ticket.agencyId && u.active && u.role === 'client_admin',
        )
        managers.forEach((m) =>
          notify({
            userId: m.id,
            agencyId: ticket.agencyId,
            title: 'Emergency dispatch queued',
            body: `${ticket.title} — emergency priority registered.`,
            link: '/workspace/operations/maintenance',
          }),
        )
      }
      return ticket
    },
    createMaintenanceTicket: ({ actorUserId, request, propertyId }) => {
      const actor = state.users.find((u) => u.id === actorUserId)
      if (!actor) return { status: 'ERROR', error: 'User context unauthorized', httpStatus: 401 }

      const unit = state.units.find((u) => u.id === request.unit_id)
      if (!unit) return { status: 'ERROR', error: 'Target unit structure not found', httpStatus: 404 }

      const prop =
        (propertyId ? state.properties.find((p) => p.id === propertyId) : undefined) ??
        state.properties.find((p) => p.unitId === unit.id)
      if (!prop) return { status: 'ERROR', error: 'Target unit structure not found', httpStatus: 404 }

      const asset = request.internal_asset_id
        ? state.internalAssets.find((a) => a.id === request.internal_asset_id)
        : undefined
      if (request.internal_asset_id && !asset) {
        return { status: 'ERROR', error: 'Linked internal asset not found', httpStatus: 404 }
      }

      const warrantyCovered = isWarrantyCovered(asset)
      const contractorId = resolvePreferredVendor(state.vendorRoutes, unit.clientId, request.category_key)
      const ticket = buildTicketFromCreate({
        id: uid('MT'),
        agencyId: unit.clientId,
        propertyId: prop.id,
        unitId: unit.id,
        request,
        reportedBy: actor.name,
        reportedByUserId: actor.id,
        assignedAgentId: unit.agentId ?? prop.agentId,
        contractorId,
        warrantyCovered,
        assetLabel: asset?.itemName ?? request.title,
      })

      patch((s) => ({ ...s, tickets: [ticket, ...s.tickets] }))
      addActivity(
        `Maintenance ${ticket.id}: ${ticket.title}${warrantyCovered ? ' · warranty claim' : ''}${contractorId ? ' · auto-assigned vendor' : ''}`,
        actor.name,
        unit.clientId,
      )
      addPropertyEvent({
        agencyId: ticket.agencyId,
        propertyId: ticket.propertyId,
        actorUserId: actor.id,
        actorName: actor.name,
        action: 'created maintenance',
        changes: [
          { field: 'Priority', from: 'None', to: ticket.priority },
          { field: 'Status', from: 'None', to: ticket.status },
        ],
      })
      emitSuiteEvent({
        agencyId: ticket.agencyId,
        resource: 'maintenance',
        action: 'created',
        title: 'Maintenance opened',
        body: `“${ticket.title}” · ${ticket.priority}`,
        link: `/workspace/properties/${ticket.propertyId}?tab=maintenance`,
        actorUserId: actor.id,
      })

      const emergencyQueued = toUiPriority(String(request.priority)) === 'Emergency'
      if (emergencyQueued) {
        state.users
          .filter((u) => u.agencyId === unit.clientId && u.role === 'client_admin' && u.active)
          .forEach((m) =>
            notify({
              userId: m.id,
              agencyId: unit.clientId,
              title: 'Emergency maintenance dispatch',
              body: `${ticket.title} queued for emergency dispatch.`,
              link: '/workspace/operations/maintenance',
            }),
          )
      }

      return {
        status: 'TICKET_CREATED',
        ticket_id: ticket.id,
        message: 'Operational request registered in tenant maintenance pipeline.',
        httpStatus: 201,
        ticket,
        warrantyCovered,
        emergencyQueued,
      }
    },
    updateTicket: (id, p) => {
      patch((s) => {
        const ticket = s.tickets.find((t) => t.id === id)
        if (!ticket) return s
        if (p.status === 'Completed') {
          const err = validateTicketCompletion(
            { internalAssetId: ticket.internalAssetId },
            {
              cost: p.cost ?? ticket.cost,
              workNotes: p.resolutionNotes ?? ticket.resolutionNotes ?? '',
              contractorId: (p.contractorId !== undefined ? p.contractorId : ticket.contractorId) ?? '',
              photos: p.photos ?? ticket.photos,
              condition: 'Good',
            },
          )
          // Incomplete close attempts must use the completion form / patchMaintenanceTicket
          if (err) return s
        }
        const merged = { ...ticket, ...p }
        let assets = s.internalAssets
        if (p.status === 'Completed' && ticket.internalAssetId && p.cost != null) {
          assets = s.internalAssets.map((a) =>
            a.id === ticket.internalAssetId
              ? { ...a, lastInspectedAt: new Date().toISOString().slice(0, 10) }
              : a,
          )
        }
        return {
          ...s,
          tickets: s.tickets.map((t) => (t.id === id ? merged : t)),
          internalAssets: assets,
        }
      })
    },
    removeTicket: (id) => {
      const ticket = state.tickets.find((t) => t.id === id)
      if (!ticket || ticket.status !== 'Requested') return false
      patch((s) => ({
        ...s,
        tickets: s.tickets.filter((t) => t.id !== id),
      }))
      emitSuiteEvent({
        agencyId: ticket.agencyId,
        resource: 'maintenance',
        action: 'deleted',
        title: 'Maintenance deleted',
        body: `“${ticket.title}” was removed before work started.`,
        link: `/workspace/properties/${ticket.propertyId}?tab=maintenance`,
      })
      return true
    },
    patchMaintenanceTicket: ({ actorUserId, ticketId, patch: body }) => {
      const actor = state.users.find((u) => u.id === actorUserId)
      if (!actor) return { status: 'ERROR', error: 'User context unauthorized', httpStatus: 403 }
      if (!canManageTickets(actor.role)) {
        return { status: 'ERROR', error: 'Action restricted from end-user execution scopes', httpStatus: 403 }
      }

      const ticket = state.tickets.find((t) => t.id === ticketId)
      if (!ticket || (actor.role !== 'super_admin' && ticket.agencyId !== actor.agencyId)) {
        return { status: 'ERROR', error: 'Maintenance not found within tenant instance', httpStatus: 404 }
      }

      const resolving =
        String(body.status).toUpperCase() === 'RESOLVED' ||
        String(body.status) === 'Completed' ||
        String(body.status).toUpperCase() === 'COMPLETED'

      if (resolving) {
        const completionError = validateTicketCompletion(ticket, {
          cost: body.actual_cost ?? NaN,
          workNotes: body.resolution_notes ?? '',
          contractorId: body.contractor_id ?? ticket.contractorId ?? '',
          photos: body.photos ?? 0,
          condition: (body.internal_asset_condition as AssetCondition | undefined) ?? 'Good',
        })
        if (completionError) {
          return { status: 'ERROR', error: completionError, httpStatus: 400 }
        }
      }

      const { ticket: next, resolved, condition } = applyTicketPatch(ticket, body)
      let assetUpdated = false

      patch((s) => {
        let assets = s.internalAssets
        if (resolved && ticket.internalAssetId && condition) {
          assetUpdated = true
          assets = s.internalAssets.map((a) =>
            a.id === ticket.internalAssetId
              ? {
                  ...a,
                  condition,
                  lastInspectedAt: new Date().toISOString().slice(0, 10),
                }
              : a,
          )
        }
        return {
          ...s,
          tickets: s.tickets.map((t) => (t.id === ticketId ? next : t)),
          internalAssets: assets,
        }
      })

      addActivity(
        `Maintenance ${ticketId} → ${next.status}${resolved ? ` · cost ${next.cost}` : ''}${assetUpdated ? ' · asset condition synced' : ''}`,
        actor.name,
        ticket.agencyId,
      )

      return {
        status: 'WORKFLOW_UPDATED',
        message: 'Operational steps recorded and linked physical configurations synchronized successfully.',
        httpStatus: 200,
        ticket: next,
        assetUpdated,
      }
    },
    runEmergencyEscalations: () => {
      let count = 0
      const now = new Date()
      setState((s) => {
        const notifications: AppNotification[] = []
        const tickets = s.tickets.map((t) => {
          if (!needsEmergencyEscalationPrecise(t, now)) return t
          count += 1
          const managers = s.users.filter(
            (u) => u.agencyId === t.agencyId && u.active && u.role === 'client_admin',
          )
          managers.forEach((m) => {
            notifications.push({
              id: uid('N'),
              userId: m.id,
              agencyId: t.agencyId,
              title: 'EMERGENCY SLA breach',
              body: `SMS/Push: ${t.title} still OPEN > 2h. Escalate immediately.`,
              at: now.toISOString(),
              read: false,
              link: '/workspace/operations/maintenance',
            })
          })
          return { ...t, escalatedAt: now.toISOString() }
        })
        if (!count) return s
        return {
          ...s,
          tickets,
          notifications: [...notifications, ...s.notifications],
          activities: [
            {
              id: uid('act'),
              agencyId: null,
              text: `Escalated ${count} emergency maintenance to portfolio managers`,
              user: 'Escalation worker',
              at: now.toISOString(),
            },
            ...s.activities,
          ],
        }
      })
      return count
    },
    notify,
    addActivity,
    runClientBillingCycle: (clientId, periodStart, periodEnd) => {
      const sub = state.clientSubscriptions.find(
        (s) => s.clientId === clientId && ['ACTIVE', 'TRIAL', 'PAST_DUE'].includes(s.status),
      )
      const plan = sub ? state.billingPlans.find((p) => p.id === sub.planId) : undefined
      if (!sub || !plan) return null

      const end = periodEnd ? new Date(periodEnd) : new Date()
      const start = periodStart
        ? new Date(periodStart)
        : new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1))
      const endDefault = periodEnd
        ? new Date(periodEnd)
        : new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0))

      const invoice = runBillingCycle({
        clientId,
        subscription: sub,
        plan,
        usageInput: {
          clientId,
          buildings: state.buildings,
          units: state.units,
          rooms: state.infraRooms,
        },
        periodStart: start.toISOString().slice(0, 10),
        periodEnd: endDefault.toISOString().slice(0, 10),
        invoiceId: uid('INV'),
      })
      patch((s) => ({ ...s, invoices: [invoice, ...s.invoices] }))
      addActivity(
        `Billing cycle invoiced ${formatClient(clientId)} — ${invoice.totalAmountDue.toFixed(2)} ZAR`,
        'Billing engine',
        clientId,
      )
      return invoice
    },
    markInvoicePaid: (invoiceId) => {
      patch((s) => ({
        ...s,
        invoices: s.invoices.map((inv) =>
          inv.id === invoiceId ? { ...inv, paymentStatus: 'PAID' as const } : inv,
        ),
      }))
    },
    emitSuiteEvent,
    markNotificationRead: (id) =>
      patch((s) => ({
        ...s,
        notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
      })),
    markAllNotificationsRead: (userId) =>
      patch((s) => ({
        ...s,
        notifications: s.notifications.map((n) =>
          n.userId === userId ? { ...n, read: true } : n,
        ),
      })),
    dismissToast,
    updateSuiteAlert: (id, alertPatch) =>
      patch((s) => ({
        ...s,
        suiteAlerts: s.suiteAlerts.map((r) => (r.id === id ? { ...r, ...alertPatch } : r)),
      })),
  }), [state, toasts, patch, addActivity, addPropertyEvent, notify, emitSuiteEvent, dismissToast])

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

function actorNameFromState(s: AppState | { users: AppUser[] }, userId: string | null, fallback: string) {
  if (!userId) return fallback
  return s.users.find((u) => u.id === userId)?.name ?? fallback
}

function formatClient(clientId: string) {
  return clientId
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used within AppStoreProvider')
  return ctx
}

export function usePublicProperties() {
  const { state } = useStore()
  return state.properties.filter((p) => ['Published', 'Featured', 'Under Offer'].includes(p.status))
}
