import { setTicketAccessNotesSupported, ticketAccessNotesSupportedFromBootstrap } from '../lib/ticketAccessNotes'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { downscaleSignature } from '../lib/signature/downscale'
import { isValidSignatureDataUrl } from '../lib/signature/signatureImage'
import type { LeaseSignCapture } from '../lib/lease/signaturePrefill'
import { applicationUploadPayload, applyDocumentUpload } from '../lib/applicationDocUpload'
import { summarizeRooms } from '../lib/roomSummary'
import { normalizePropertyRefs } from '../lib/propertyRefs'
import type {
  Agency,
  AppUser,
  Application,
  ApplicationDocument,
  ApplicationStage,
  Lead,
  LeadRequirementCompletion,
  MaintenanceTicket,
  AgencyContractor,
  Message,
  MessageThread,
  AppNotification,
  NotificationBroadcast,
  PaymentRecord,
  PropertyAsset,
  PropertyDocument,
  PropertyEvent,
  LeaseSignEvent,
  Review,
  ReviewTargetType,
  Role,
  Room,
  SuiteAlertAction,
  SuiteAlertResource,
  SuiteAlertRule,
  Tenancy,
  Viewing,
  ViewingSlot,
  Activity,
  // Trust / Banking types
  TrustTransaction,
  TrustAllocation,
  PayoutInstruction,
  DepositHolding,
  ArrearsSnapshot,
  Charge,
  CsvImportBatch,
} from '../types/domain'
import {
  applyApprovePayout,
  applySubmitPayout,
  approveDepositRelease,
  buildHeldDeposit,
  buildProposedPayout,
  proposeDepositRelease,
  DEPOSIT_NEEDS_SERVER_COPY,
  checkRefundSplit,
} from '../lib/trust/depositDualControl'
import { commitProposedPayout } from '../lib/trust/proposePayoutCommit'
import { isPubliclyListed } from '../lib/publicListings'
import { findByListingId, nextUniquePropertyId } from '../lib/listingIds'
import { CreatePropertyBundleError } from '../lib/createPropertyBundleError'
import { dedupePropertyAssets } from '../lib/propertyDedupe'
import {
  uid,
  formatZAR,
} from '../data/seed'
import type { AssetCondition, Building, InfraRoom, InternalAsset, LookupConfig, RoomKind, Unit, UnitTemplate } from '../data/infrastructure'
import { UNIT_TEMPLATES } from '../data/infrastructure'
import type { MarkPaymentPaidDetails } from '../components/payments/types'
import { isRequiredLookupKey, GLOBAL_CLIENT_ID } from '../data/platformLookups'
import { agencyOverrideFor } from '../lib/lookups'
import { DEFAULT_AGENCY_PERMISSIONS, defaultLicenseStatus, isAgencyStaff, rolePermissions, userBasePermissions } from '../lib/permissions'
import {
  allDocsUploaded,
  buildDocumentChecklist,
  STAGE_PROGRESS,
} from '../lib/workflow'
import {
  applyWorkflowTransition,
  getAvailableTransitions,
  normalizeApplication,
  resolveWorkflowStatus,
  workflowProgress,
  workflowStageLabel,
  type WorkflowStatusKey,
  type WorkflowTransition,
} from '../lib/applicationWorkflow'
import {
  buildApplicantApplicationActions,
  isApplicantAcceptanceStatus,
} from '../lib/applicantPortalActions'
import { notifyAcceptedElsewhere } from '../lib/applicantAcceptance'
import {
  closeOutcomeHistoryLabel,
  closeOutcomesForLeadType,
  isClosedLeadStage,
  type ClosedLeadStage,
} from '../lib/leadLifecycle'
import { appendWorkflowEvent } from '../lib/applicationWorkflowEvents'
import {
  captureAdultCreditCheckConsents,
  captureScreeningConsent,
  setCreditConsentAdultRoster,
  overrideScreening,
  startScreening,
  type ScreeningAsyncStatus,
} from '../lib/screening'
import {
  isContractorApprovedForAgency,
  syncTicketPhotoCount,
} from '../lib/contractors'
import {
  SEED_BILLING_PLANS,
  runBillingCycle,
  type BillingPlan,
  type ClientSubscription,
  type InvoiceLineItem,
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
import { initialWorkflowForCreate } from '../lib/createApplicationInitialStatus'
import {
  allocationSaveFailedMessage,
  csvImportSaveFailedMessage,
  persistInOrder,
  TRUST_SAVE_FAILED,
} from '../lib/trust/commitTrustWrites'
import { formatEmploymentSummary } from '../lib/employmentDisplay'
import {
  patchApplicationStatus,
  type PatchApplicationStatusRequest,
  type PatchApplicationStatusResult,
} from '../lib/api/applicationStatusApi'
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
import { roomsToInfraRooms } from '../lib/infraRoomsFromBootstrap'
import type { PostgresBootstrap } from '../lib/api/postgresClient'
import { isApiEnabled } from '../lib/api/config'
import { ensureLeaseEnvelopeForSign, leaseSignatureSaved } from '../lib/leaseSignatureOrdering'
import { persistRefusalMessage } from '../lib/api/persistRefusal'
import {
  bootstrapActorKey,
  dedupeBootstrapFetch,
  markBootstrapFetched,
  resetBootstrapCoordForRetry,
  scheduleDeferredFullBootstrap,
  shouldIgnoreBootstrapMissAfterFetch,
} from '../lib/bootstrapCoord'
import {
  APP_STATE_STORAGE_KEY,
  PG_SOURCE_STORAGE_KEY,
  readOwnedClientCache,
  serializeClientCache,
  shouldDeferMountBootstrap,
  createClientCacheWriter,
  handleAuthKeyStorageEvent,
  bootstrapMatchesSession,
  bootstrapSessionUserId,
  canApplyBootstrapHydration,
} from '../lib/clientCache'
import { readStoredAuthUserId, getApiActor, actorHeaders, type DemoActor } from '../lib/api/actorAuth'
import { defaultRentalJourneyForAgency } from '../lib/journey/resolveJourney'
import type { WorkflowActionCapture } from '../lib/workflowActionForms'
import {
  clearPortfolioSnapshot,
  hasPortfolioSnapshotForUser,
  mergePortfolioSnapshotIntoState,
  writePortfolioSnapshotFromState,
  type PortfolioSnapshotActor,
} from '../lib/portfolioSnapshot'
import { ensureBootstrapScopedForActor, bootstrapActorFromSession } from '../lib/applyBootstrapScope'
function portfolioSnapshotActor(
  actor: DemoActor | { userId: string; role: string; agencyId: string | null } | null | undefined,
): PortfolioSnapshotActor | null {
  if (!actor?.userId || !actor.role) return null
  return {
    userId: actor.userId,
    role: actor.role as Role,
    agencyId: actor.agencyId ?? null,
  }
}
import { authHeaders } from '../lib/api/authClient'
import { emptyPublicMarketplaceBootstrapWithReason } from '../lib/publicMarketplaceDemo'
import {
  computeUnitPatchForPropertyStatus,
  repairUnitsForMarketplaceVisibility,
} from '../lib/marketplaceVisibility'
import {
  enrichBootstrapWithPublicMarketplace,
  fetchMergedPublicMarketplaceSlice,
} from '../lib/publicMarketplaceMerge'
import { shouldApplyRefreshResult } from '../lib/refreshCoordination'
import {
  PERSIST_REFUSED_EVENT,
  persistApproveApplication,
  persistMarkNotificationsRead,
  type PersistRefusal,
  queueDelete,
  queuePersistBatch,
  queueUpsert,
} from '../lib/api/persist'
import { diffNewNotifications, toastsForNewNotifications } from '../lib/notificationSync'
import {
  SUPPORT_BODY_MAX,
  SUPPORT_SUBJECT_MAX,
  type SupportAction,
  type SupportTicket,
} from '../lib/supportTickets'
import {
  collectViewingAttendeeUserIds,
  describeViewingBookingChanges,
  describeViewingSlotChanges,
  slotPatchIsMaterial,
  viewingNotificationLink,
} from '../lib/viewingNotifications'
import {
  notifyMaintenanceOpened,
  notifyMaintenanceStatusChanged,
  notifyViewingScheduled,
  notifyViewingStatusChanged,
} from '../lib/eventNotifications'
import { mergeEntityLists } from '../lib/bootstrapMerge'
import { reconcileAgencyIdSpace } from '../lib/agencyScope'
import { buildIdMapCacheFromRows, type IdMapCache } from '../lib/idMap'
import { dispatchNotificationsToServer } from '../lib/api/notificationDispatchApi'
import {
  canDeleteStoredProperty,
  getPropertyDeleteBlockReason,
} from '../lib/propertyDeletion'
import {
  issueLeaseOnTenancyCreate,
  recordLeaseSignature,
  workflowStatusFromESign,
} from '../lib/lease/pipeline'
import {
  appendDunningNotes,
  buildDunningNotice,
  canSendDunningNotice,
  planRentCycle,
  type DunningStage,
} from '../lib/rentCycle'
import {
  acceptRenewalOnBook,
  applyEscalationOnBook,
  buildCpaExpiryNotice,
  canSendCpaExpiryNotice,
  declineRenewalOnBook,
  ensureRenewalOps,
  markMonthToMonthOnBook,
  offerRenewalOnBook,
  planDueEscalations,
  setEscalationOnBook,
  syncCpaNoticeClock,
} from '../lib/renewals'
import {
  applicationStakeholderIds,
  applySuiteAlertFilter,
  excludeActorFromIds,
  leadStakeholderIds,
  maintenanceDeskStakeholderIds,
  messageThreadRecipientIds,
  paymentDeskStakeholderIds,
  propertyDeskStakeholderIds,
  unitDeskStakeholderIds,
  viewingDeskStakeholderIds,
  viewingSlotDeskStakeholderIds,
} from '../lib/notificationRecipients'
import { propertyRefLabel } from '../lib/propertyRefs'

/**
 * App state persistence key.
 * Bump when seed content must refresh for existing browsers.
 * When the local Postgres API is up, AppStore hydrates core entities from `/api/bootstrap`
 * and still mirrors into localStorage for offline edits.
 */
const STORAGE_KEY = APP_STATE_STORAGE_KEY
const PG_HYDRATED_FLAG = PG_SOURCE_STORAGE_KEY
export { APP_STATE_STORAGE_KEY, PG_SOURCE_STORAGE_KEY }

function actorFromUsers(
  users: AppUser[],
  override?: DemoActor | null,
): DemoActor | null {
  if (override) return override
  const id = readStoredAuthUserId()
  const u = id ? users.find((x) => x.id === id) : null
  if (!u) return null
  return { userId: u.id, role: u.role, agencyId: u.agencyId }
}

/**
 * Prefer Auth/getApiActor over mount-time users hydrate.
 * actorFromUsers returns null until users row exists even when AUTH_KEY is set —
 * that null-actor race bypassed #56 tenant fail-closed.
 */
function resolveBootstrapActor(
  users: AppUser[],
  override?: DemoActor | null,
): DemoActor | null {
  if (override) return override
  const api = getApiActor()
  if (api?.userId && api.role) return api
  return actorFromUsers(users)
}

/** Preserve portal apps/TN FE user ids when a later boot re-emits null FE links. */
function preservePortalFeLinks(base: AppState, boot: PostgresBootstrap): PostgresBootstrap {
  const liveId = readStoredAuthUserId() ?? getApiActor()?.userId ?? null
  if (!liveId) return boot

  const bootApps = (boot.applications as Array<Record<string, unknown>> | undefined) ?? undefined
  const bootTns = (boot.tenancies as Array<Record<string, unknown>> | undefined) ?? undefined

  let applications = boot.applications
  let tenancies = boot.tenancies

  if (Array.isArray(bootApps)) {
    const baseById = new Map(base.applications.map((a) => [a.id, a]))
    applications = bootApps.map((row) => {
      const id = typeof row.id === 'string' ? row.id : ''
      const prev = id ? baseById.get(id) : undefined
      if (!prev) return row
      const remoteApplicant = row.applicantUserId
      if (
        prev.applicantUserId === liveId &&
        (remoteApplicant == null || remoteApplicant === '')
      ) {
        return { ...row, applicantUserId: prev.applicantUserId }
      }
      return row
    }) as typeof boot.applications
  }

  if (Array.isArray(bootTns)) {
    const baseById = new Map(base.tenancies.map((t) => [t.id, t]))
    tenancies = bootTns.map((row) => {
      const id = typeof row.id === 'string' ? row.id : ''
      const prev = id ? baseById.get(id) : undefined
      if (!prev) return row
      const remoteTenant = row.tenantUserId
      if (
        prev.tenantUserId === liveId &&
        (remoteTenant == null || remoteTenant === '')
      ) {
        return { ...row, tenantUserId: prev.tenantUserId }
      }
      return row
    }) as typeof boot.tenancies
  }

  if (applications === boot.applications && tenancies === boot.tenancies) return boot
  return { ...boot, applications, tenancies }
}

/** When Postgres bootstrap succeeds, merge server rows with recent local writes (exported for tests). */
export function applyPostgresBootstrap(base: AppState, boot: PostgresBootstrap): AppState {
  const liveActor = resolveBootstrapActor(base.users)
  boot = ensureBootstrapScopedForActor(
    boot,
    liveActor
      ? bootstrapActorFromSession({
          userId: liveActor.userId,
          role: liveActor.role,
          agencyId: liveActor.agencyId,
        })
      : boot.actor
        ? bootstrapActorFromSession({
            userId: boot.actor.userId,
            role: boot.actor.role,
            agencyId: boot.actor.agencyId,
          })
        : null,
  )
  boot = preservePortalFeLinks(base, boot)
  const replaceLinked = Boolean(boot.scoped)
  const mergeOpts = { replaceWhenMissing: replaceLinked }
  const pick = <T extends { id: string }>(
    baseList: T[],
    bootList: T[] | undefined,
    collectionKey: string,
  ): T[] => mergeEntityLists(baseList, bootList, collectionKey, mergeOpts)

  // A super admin's bootstrap carries every clients row (no row window), so
  // cached agencies it no longer returns (deleted, re-keyed) are dropped
  // rather than lingering on the Agencies page. Recent local writes still win
  // (mergeEntityLists TTL). Other roles keep the merge: their list is their
  // own agency plus marketplace agencies merged in elsewhere.
  let agencies = mergeEntityLists(
    base.agencies,
    ((boot.agencies as Agency[]) ?? []).map((a) => ({
      ...a,
      enabledPermissions:
        Array.isArray(a.enabledPermissions) && a.enabledPermissions.length
          ? a.enabledPermissions
          : [...DEFAULT_AGENCY_PERMISSIONS],
    })),
    'agencies',
    {
      replaceWhenMissing:
        replaceLinked || (boot.actor?.role === 'super_admin' && Array.isArray(boot.agencies)),
    },
  )
  let users = pick(base.users, (boot.users as AppUser[]) ?? [], 'users')
  let properties = pick(base.properties, boot.properties as PropertyAsset[], 'properties')
  const reconciled = reconcileAgencyIdSpace(agencies, users, properties)
  agencies = reconciled.agencies
  users = reconciled.users
  properties = (reconciled.properties as PropertyAsset[]) ?? properties
  let units = pick(base.units, boot.units as Unit[], 'units')
  units = repairUnitsForMarketplaceVisibility(properties, units, users)
  properties = dedupePropertyAssets(properties, units)

  // Rows can reference a property by units.id (UUID) while properties are keyed by
  // listing id; normalize so title lookups resolve instead of showing the UUID.
  return normalizePropertyRefs({
    ...base,
    publicMarketplaceFetchFailed: Boolean(boot.marketplaceFetchFailed),
    agencies,
    users,
    properties,
    buildings: pick(base.buildings, boot.buildings as Building[], 'buildings'),
    units,
    leads: pick(base.leads, boot.leads as Lead[], 'leads'),
    applications: pick(base.applications, boot.applications as Application[], 'applications').map(
      normalizeApplication,
    ),
    tenancies: pick(base.tenancies, boot.tenancies as Tenancy[], 'tenancies'),
    viewings: pick(base.viewings, boot.viewings as Viewing[], 'viewings'),
    payments: pick(base.payments, boot.payments as PaymentRecord[], 'payments'),
    propertyDocuments: pick(
      base.propertyDocuments,
      boot.propertyDocuments as PropertyDocument[],
      'propertyDocuments',
    ),
    tickets: pick(base.tickets, boot.tickets as MaintenanceTicket[], 'tickets'),
    agencyContractors: pick(
      base.agencyContractors,
      boot.agencyContractors as AgencyContractor[] | undefined,
      'agencyContractors',
    ),
    threads: pick(base.threads, boot.threads as MessageThread[], 'threads'),
    messages: pick(base.messages, boot.messages as Message[], 'messages'),
    notifications: pick(base.notifications, boot.notifications as AppNotification[], 'notifications'),
    viewingSlots: pick(base.viewingSlots, boot.viewingSlots as ViewingSlot[] | undefined, 'viewingSlots'),
    suiteAlerts: pick(base.suiteAlerts, boot.suiteAlerts as SuiteAlertRule[] | undefined, 'suiteAlerts'),
    activities: pick(base.activities, boot.activities as Activity[] | undefined, 'activities'),
    propertyEvents: pick(
      base.propertyEvents,
      boot.propertyEvents as PropertyEvent[] | undefined,
      'propertyEvents',
    ),
    invoices: pick(base.invoices, boot.invoices as PlatformInvoice[] | undefined, 'invoices'),
    leaseSignEvents: Array.isArray(boot.leaseSignEvents)
      ? (boot.leaseSignEvents as LeaseSignEvent[])
      : base.leaseSignEvents,
    lookups: boot.lookups?.length
      ? (boot.lookups as LookupConfig[])
      : base.lookups,
    // Trust & Banking books (P0-7) — replace demo seed with the agency's real rows.
    trustTransactions: (boot.trustTransactions as TrustTransaction[] | undefined)?.length
      ? (boot.trustTransactions as TrustTransaction[])
      : base.trustTransactions,
    trustAllocations: (boot.trustAllocations as TrustAllocation[] | undefined)?.length
      ? (boot.trustAllocations as TrustAllocation[])
      : base.trustAllocations,
    payoutInstructions: (boot.payoutInstructions as PayoutInstruction[] | undefined)?.length
      ? (boot.payoutInstructions as PayoutInstruction[])
      : base.payoutInstructions,
    depositHoldings: (boot.depositHoldings as DepositHolding[] | undefined)?.length
      ? (boot.depositHoldings as DepositHolding[])
      : base.depositHoldings,
    arrearsSnapshots: (boot.arrearsSnapshots as ArrearsSnapshot[] | undefined)?.length
      ? (boot.arrearsSnapshots as ArrearsSnapshot[])
      : base.arrearsSnapshots,
    csvImportBatches: (boot.csvImportBatches as CsvImportBatch[] | undefined)?.length
      ? (boot.csvImportBatches as CsvImportBatch[])
      : base.csvImportBatches,
    // CR7: server-filtered and authoritative — replace, never merge with local rows.
    supportTickets: Array.isArray(boot.supportTickets)
      ? (boot.supportTickets as SupportTicket[])
      : base.supportTickets,
    infraRooms: pick(base.infraRooms, boot.infraRooms as InfraRoom[] | undefined, 'infraRooms'),
    internalAssets: pick(
      base.internalAssets,
      boot.internalAssets as InternalAsset[] | undefined,
      'internalAssets',
    ),
    idMapCache:
      boot.idMapRows?.length
        ? buildIdMapCacheFromRows(boot.idMapRows)
        : base.idMapCache,
  })
}


/** CR10: PNG within the 150 KB cap (downscaled on the client when over). */
async function sendableSignature(img: string | undefined): Promise<string | undefined> {
  if (!img) return undefined
  if (isValidSignatureDataUrl(img)) return img
  return (await downscaleSignature(img)) ?? img
}

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
  notificationBroadcasts: NotificationBroadcast[]
  suiteAlerts: SuiteAlertRule[]
  tickets: MaintenanceTicket[]
  activities: Activity[]
  propertyDocuments: PropertyDocument[]
  propertyEvents: PropertyEvent[]
  /** CR10: lease_signed audit rows from the server bootstrap (absent offline). */
  leaseSignEvents?: LeaseSignEvent[]
  reviews: Review[]
  billingPlans: BillingPlan[]
  clientSubscriptions: ClientSubscription[]
  invoices: PlatformInvoice[]
  vendorRoutes: VendorCategoryRoute[]
  agencyContractors: AgencyContractor[]
  // Trust / Banking module state
  trustTransactions: TrustTransaction[]
  trustAllocations: TrustAllocation[]
  payoutInstructions: PayoutInstruction[]
  depositHoldings: DepositHolding[]
  arrearsSnapshots: ArrearsSnapshot[]
  charges: Charge[]
  csvImportBatches: CsvImportBatch[]
  /** CR7 help desk tickets (event_log, server-only). */
  supportTickets: SupportTicket[]
  /** True when the last guest marketplace fetch errored (signed-out /browse). */
  publicMarketplaceFetchFailed: boolean
  /** Background public marketplace fetch (UI only — never clears listing rows). */
  marketplaceRefreshing: boolean
  /** True once a public marketplace load has finished this visit (success or failure). Never restored from cache. */
  publicMarketplaceSettled: boolean
  /** Background signed-in bootstrap refresh (UI only). */
  sessionRefreshing: boolean
  /** Backend → FE ids from entity_id_map (routing only; never render). */
  idMapCache: IdMapCache | null
}

type StoreContextValue = {
  state: AppState
  /** Session user whose bootstrap has landed in the store (null until then). */
  hydratedForUserId: string | null
  /** Session user changed: drop the previous user's in-memory state before their bootstrap. */
  resetForUserSwitch: () => void
  /** Signed-in bootstrap failed (portals show retry instead of a skeleton). */
  hydrationFailed: boolean
  resetDemo: () => void
  /** Re-fetch bootstrap for the given (or current) actor. */
  refreshBootstrap: (
    actor?: DemoActor | null,
    opts?: { full?: boolean; force?: boolean; ingestNotifications?: boolean },
  ) => Promise<void>
  /** Lite workspace bootstrap with force + stale-guard (nav, LiveSync, post-mutation). */
  refreshSessionData: (opts?: {
    full?: boolean
    force?: boolean
    ingestNotifications?: boolean
  }) => Promise<void>
  /** Public listings slice — guest RPC or merged marketplace for signed-in browse. */
  refreshMarketplaceListings: (opts?: { force?: boolean }) => Promise<void>
  createAgency: (input: Omit<Agency, 'id' | 'createdAt' | 'status'> & { status?: Agency['status']; enabledPermissions?: Agency['enabledPermissions'] }) => Agency
  updateAgency: (id: string, patch: Partial<Agency>) => void
  /** Soft-delete: sets agency status to Cancelled (data retained; staff lose access). */
  cancelAgency: (id: string) => Promise<{ ok: true } | { ok: false; reason: string }>
  createUser: (input: Omit<AppUser, 'id' | 'active'> & {
    active?: boolean
    /** Plain password for invite / staff create (hashed server-side). */
    password?: string
    tempPassword?: string
    /** Michael #96: called once with the server-generated temp password (no password given). */
    onTempPassword?: (tempPassword: string) => void
  }) => AppUser
  /**
   * P0-sa-mint: await durable Auth+profile persist before success UI.
   * Rolls back the optimistic user when Auth link / grant verify fails.
   */
  createUserDurable: (input: Omit<AppUser, 'id' | 'active'> & {
    active?: boolean
    password?: string
    tempPassword?: string
  }) => Promise<
    | { ok: true; user: AppUser; generatedTempPassword?: string }
    | { ok: false; error: string; user?: AppUser }
  >
  updateUser: (id: string, patch: Partial<AppUser>) => void
  /**
   * CR10: save (or clear with null) the session user's own signature
   * (users.metadata.signature via the user upsert). Resolves false when the
   * server refuses it (e.g. 400 SIGNATURE_INVALID); local state is reverted.
   */
  saveMySignature: (userId: string, signature: string | null) => Promise<boolean>
  updateTenancy: (id: string, patch: Partial<Tenancy>) => void
  /** Issue lease PDF + e-sign envelope for an existing tenancy (approve path / manual). */
  issueLeasePackage: (tenancyId: string, actor?: { userId?: string; name?: string }) => Promise<{
    ok: boolean
    error?: string
  }>
  /** Record tenant/landlord e-sign against the tenancy envelope. */
  recordTenancyLeaseSign: (params: {
    tenancyId: string
    party: 'tenant' | 'landlord'
    signerName: string
    signatureDataUrl?: string
    /** CR10: drawn | saved_image | paper_mark (re-checked by the server). */
    method?: 'drawn' | 'saved_image' | 'paper_mark'
    onBehalfConfirmation?: string
    ectaConsent?: import('../lib/lease/types').EctaConsent
    actorUserId?: string | null
  }) => Promise<{ ok: boolean; error?: string }>
  assignRole: (userId: string, role: Role, agencyId?: string | null) => void
  createLookup: (input: Omit<LookupConfig, 'id' | 'sortOrder' | 'isActive'> & { sortOrder?: number; isActive?: boolean }) => LookupConfig
  /** With `forAgencyId`, edits to a built-in (global) row are saved as that agency's override. */
  updateLookup: (id: string, patch: Partial<Pick<LookupConfig, 'displayLabel' | 'isActive' | 'sortOrder' | 'keyValue' | 'meta'>>, forAgencyId?: string | null) => void
  reorderLookups: (clientId: string, configType: string, orderedIds: string[], forAgencyId?: string | null) => void
  deactivateLookup: (id: string, forAgencyId?: string | null) => boolean
  broadcastNotification: (input: {
    title: string
    body: string
    link?: string
    audience: 'everyone' | 'agency' | 'person'
    agencyId?: string | null
    userId?: string | null
    createdByUserId: string
  }) => NotificationBroadcast
  createProperty: (input: Omit<PropertyAsset, 'id' | 'createdAt' | 'rooms' | 'images'> & { images?: string[]; rooms?: Room[] }) => PropertyAsset
  createPropertyBundle: (input: {
    existingBuildingId?: string
    building?: Omit<Building, 'id' | 'createdAt' | 'images'> & { images?: string[] }
    unitTemplateId?: import('../data/infrastructure').UnitTemplateId
    unit: {
      unitNumber: string
      title: string
      listingType: import('../data/infrastructure').UnitListingType
      price: number | null
      rent: number | null
      agentId: string | null
      squareMeters?: number
      bedrooms?: number
      bathrooms?: number
      parking?: number
      description?: string
      amenities?: string[]
    }
    rooms: Array<{
      name: string
      kind: RoomKind
      beds: number
      baths: number
      areaSqm?: number
      layout?: InfraRoom['layout']
    }>
    property: Omit<PropertyAsset, 'id' | 'createdAt' | 'buildingId' | 'unitId' | 'rooms' | 'images' | 'beds' | 'baths' | 'garages'> & {
      images?: string[]
      rooms?: Room[]
      unitNumber?: string
    }
    starterAssets?: Array<{
      roomName: string
      itemName: string
      assetTypeKey: string
      brand?: string
      condition: AssetCondition
    }>
    ids?: { propertyId: string; buildingId?: string; roomIds?: string[] }
    idempotencyKey?: string
  }) => Promise<PropertyAsset>
  updateProperty: (id: string, patch: Partial<PropertyAsset>) => void
  /**
   * Assign (or clear) a property's agent and wait for the server. On a refusal
   * the local change is undone and the reason is returned.
   */
  assignPropertyAgent: (id: string, agentId: string | null) => Promise<{ ok: true } | { ok: false; reason: string }>
  setPropertyRooms: (id: string, rooms: Room[]) => void
  /** P0-publish: returns whether the listing actually flipped to a public state.
   *  P0-publish (R7): `created` lets the wizard pass the just-created property
   *  snapshot — same-tick create→publish runs before React re-renders, so
   *  stateRef.current does not contain the new property yet.
   *  P0-5: awaits durable property+unit status writes; false until committed. */
  publishProperty: (
    id: string,
    status?: PropertyAsset['status'],
    created?: PropertyAsset,
  ) => Promise<boolean>
  deleteProperty: (
    id: string,
  ) => Promise<{ ok: true } | { ok: false; reason: string }>
  restoreProperty: (id: string) => Promise<{ ok: true } | { ok: false; reason: string }>
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
  createReview: (input: {
    targetType: ReviewTargetType
    targetId: string
    propertyId?: string | null
    agencyId?: string | null
    authorUserId: string
    authorName: string
    rating: number
    body: string
  }) => Review | { error: string }
  createLead: (input: Omit<Lead, 'id' | 'createdAt' | 'updatedAt' | 'notes' | 'stage'> & { stage?: string; notes?: string; id?: string; persist?: boolean }) => Lead
  /** Local-only CRM update after a guest enquiry was saved server-side. */
  recordGuestEnquiry: (input: {
    lead: Omit<Lead, 'createdAt' | 'updatedAt'> & { createdAt?: string; updatedAt?: string }
    viewing?: {
      id?: string
      agencyId: string
      propertyId: string
      agentId: string | null
      slotId: string
      applicantName: string
      applicantEmail?: string
      date: string
      time: string
    } | null
  }) => void
  updateLeadStage: (id: string, stage: string) => void
  /** Record/requirement progress for a lead pipeline step. */
  setLeadRequirementState: (
    leadId: string,
    stageValue: string,
    requirementId: string,
    patch: Partial<LeadRequirementCompletion>,
  ) => void
  closeLead: (
    id: string,
    input: { stage: ClosedLeadStage; reason: string },
  ) => { ok: true; leadId: string; stage: ClosedLeadStage } | { ok: false; reason: string }
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
    employerName?: string
    jobTitle?: string
    idNumberOrPassport?: string
    moveInDate?: string
    uploadedDocs?: Application['uploadedDocs']
    /** Skip income/availability guards (admin/demo only) */
    skipGuards?: boolean
  }) => Promise<Application | SubmitApplicationResult>
  updateApplication: (id: string, patch: Partial<Application>) => void
  /** POPIA consent capture before bureau screening. */
  captureApplicationScreeningConsent: (
    applicationId: string,
    input?: {
      grantedBy?: string | null
      method?: 'document' | 'checkbox' | 'portal' | 'staff'
      note?: string
      adults?: Array<{ name: string; idNumber: string; signatureText: string }>
    },
  ) => Promise<Application | null>
  /** Start async screening via ScreeningProvider (requires consent). */
  startApplicationScreening: (params: {
    applicationId: string
    actorUserId: string
  }) => Promise<{ ok: true; application: Application } | { ok: false; error: string }>
  /** Audited agent override of screening outcome. */
  overrideApplicationScreening: (params: {
    applicationId: string
    actorUserId: string
    newStatus: Extract<ScreeningAsyncStatus, 'passed' | 'failed' | 'manual_override'>
    reason: string
    score?: number | null
    externalReference?: string | null
  }) => Promise<{ ok: true; application: Application } | { ok: false; error: string }>
  setDocumentStatus: (
    applicationId: string,
    key: string,
    status: ApplicationDocument['status'],
    note?: string,
  ) => Promise<boolean>
  uploadApplicationDocument: (
    applicationId: string,
    key: string,
    file: { name: string; mimeType: string; dataUrl: string },
    actor?: { userId: string; name: string },
  ) => Promise<boolean>
  advanceApplication: (id: string, to?: ApplicationStage) => void
  /** P0-approve: awaited so callers only show success after a durable write. */
  approveApplication: (
    id: string,
    options?: { actorUserId?: string },
  ) => Promise<PatchApplicationStatusResult>
  /** Mirrors PATCH /api/v1/applications/{id}/status */
  /** Advance via configurable rental / purchase workflow template */
  advanceApplicationWorkflow: (params: {
    applicationId: string
    actorUserId: string
    targetStatus: WorkflowStatusKey
    /** CR10: TENANT_SIGNED / LANDLORD_SIGNED / MARK_LEASE_SIGNED carry the sign dialog capture. */
    signature?: LeaseSignCapture & { signerName?: string }
    capture?: WorkflowActionCapture
  }) => Promise<PatchApplicationStatusResult | { status: 'SUCCESS'; application: Application }>
  patchApplicationStatus: (params: {
    applicationId: string
    actorUserId: string
    request: PatchApplicationStatusRequest
  }) => Promise<PatchApplicationStatusResult>
  scheduleMoveIn: (id: string, moveInDate: string, keyCollection: NonNullable<Application['keyCollection']>) => void
  completeKeyHandover: (id: string) => Promise<void>
  createViewingSlot: (input: Omit<ViewingSlot, 'id' | 'booked' | 'status'> & { capacity?: number }) => ViewingSlot
  updateViewingSlot: (id: string, patch: Partial<ViewingSlot>) => void
  bookViewingSlot: (slotId: string, applicantName: string, applicantEmail?: string, applicationId?: string) => Viewing | null
  createViewing: (input: Omit<Viewing, 'id' | 'status' | 'attendance' | 'slotId'> & Partial<Pick<Viewing, 'status' | 'attendance' | 'slotId'>>) => Viewing
  updateViewing: (id: string, patch: Partial<Viewing>) => void
  createPayment: (input: Omit<PaymentRecord, 'id' | 'paidAt' | 'method' | 'status'> & Partial<Pick<PaymentRecord, 'status' | 'paidAt' | 'method'>>) => PaymentRecord
  markPaymentPaid: (id: string, details?: string | MarkPaymentPaidDetails) => void
  /** Mode A: escalate overdue + ensure next Rent rows for Active tenancies (no live bank). */
  runRentCycle: (asOf?: string) => {
    escalated: number
    created: PaymentRecord[]
    asOf: string
  }
  /** Mode A: in-app dunning notice always; optional Mailtrap email behind ENABLE_EMAIL_DUNNING (default OFF). */
  sendDunningNotice: (
    paymentId: string,
    opts?: { stage?: DunningStage; actorUserId?: string | null; actorName?: string },
  ) => { ok: true; stage: DunningStage } | { ok: false; reason: string }
  /** Mode A renewals: offer terms on book (beside OFFER_RENEWAL stage). */
  offerLeaseRenewal: (
    tenancyId: string,
    input?: { offeredEndDate?: string; offeredRent?: number; termMonths?: number; asOf?: string },
  ) => { ok: true } | { ok: false; reason: string }
  /** Mode A: accept extends term+rent on book. */
  acceptLeaseRenewal: (
    tenancyId: string,
    opts?: { asOf?: string },
  ) => { ok: true; newEndDate: string; newRent: number } | { ok: false; reason: string }
  /** Mode A: decline → notice_given on book. */
  declineLeaseRenewal: (
    tenancyId: string,
    opts?: { asOf?: string },
  ) => { ok: true; noticeGivenAt: string } | { ok: false; reason: string }
  /** Mode A: no election past lease_end → month-to-month note (not auto 12-mo). */
  markLeaseMonthToMonth: (
    tenancyId: string,
    opts?: { asOf?: string },
  ) => { ok: true } | { ok: false; reason: string }
  /** Mode A: in-app cpa_expiry_notice (not live CPA delivery). */
  sendCpaExpiryNotice: (
    tenancyId: string,
    opts?: { asOf?: string },
  ) => { ok: true; late: boolean } | { ok: false; reason: string }
  /** Mode A: staff-set escalationPct / nextEscalationOn (not live CPI). */
  setLeaseEscalation: (
    tenancyId: string,
    input: { escalationPct: number | null; nextEscalationOn: string | null; asOf?: string },
  ) => { ok: true } | { ok: false; reason: string }
  /** Mode A: apply due scheduled increases across Active tenancies. */
  /** Apply due scheduled increases; pass tenancyIds to touch only those leases. */
  applyDueLeaseEscalations: (asOf?: string, opts?: { tenancyIds?: string[] }) => { applied: number; asOf: string }
  sendMessage: (threadId: string, fromUserId: string, body: string) => Message
  createThread: (input: Omit<MessageThread, 'id' | 'updatedAt'> & { initialMessage: string; fromUserId: string }) => MessageThread
  createTicket: (input: Omit<MaintenanceTicket, 'id' | 'openedAt' | 'status' | 'cost' | 'photos' | 'contractorId' | 'assignedAgentId' | 'reportedByUserId'> & Partial<Pick<MaintenanceTicket, 'status' | 'cost' | 'photos' | 'contractorId' | 'assignedAgentId' | 'reportedByUserId' | 'categoryKey' | 'unitId' | 'internalAssetId' | 'warrantyCovered'>>) => MaintenanceTicket
  createMaintenanceTicket: (params: {
    actorUserId: string
    request: CreateTicketRequest
    propertyId?: string
    /** Staff: the tenancy this ticket is for (server validates the link). */
    tenancyId?: string | null
    /** Sent with the create (tenant faults: photos and access notes). */
    extras?: Partial<Pick<MaintenanceTicket, 'accessNotes' | 'photoUrls' | 'locationDetail'>>
  }) => CreateTicketResult
  updateTicket: (id: string, patch: Partial<MaintenanceTicket>) => void
  /** Help desk: raise a system ticket to the super admins. Awaits the server; nothing is kept on failure. */
  submitSupportTicket: (input: {
    actor: { id: string; name: string; role: Role; agencyId: string | null }
    subject: string
    body: string
    category?: string
    attachments?: string[]
    pageUrl?: string | null
    userAgent?: string | null
  }) => Promise<{ ok: true; ticket: SupportTicket } | { ok: false; error: string }>
  /** Help desk: reply / status / priority / assign / close / reopen / rate (server-checked). */
  actOnSupportTicket: (input: {
    actorName: string
    ticketId: string
    act: SupportAction
  }) => Promise<{ ok: true; ticket: SupportTicket } | { ok: false; error: string }>
  assignContractorToTicket: (params: {
    ticketId: string
    contractorUserId: string | null
    actorUserId: string
  }) => boolean
  updateMaintenanceTicketDetails: (id: string, patch: Partial<MaintenanceTicket>) => void
  addAgencyContractor: (input: Omit<AgencyContractor, 'id'>) => AgencyContractor
  updateAgencyContractor: (id: string, patch: Partial<AgencyContractor>) => void
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
    recipientUserIds: string[]
  }) => void
  markNotificationRead: (id: string) => void
  markAllNotificationsRead: (userId: string) => void
  dismissToast: (id: string) => void
  addActivity: (text: string, user: string, agencyId: string | null) => void
  /** P0-7: allocate an unallocated trust receipt to occupancy buckets. */
  allocateTrustReceipt: (params: {
    transactionId: string
    actorUserId: string
    lines: Array<{ occupancyId: string; bucketCode: string; amountCents: number }>
  }) => Promise<{ ok: boolean; error?: string }>
  /** P0-7: park a matched-but-unassignable receipt in suspense (aged + alerted). */
  markTrustSuspense: (params: { transactionId: string; actorUserId: string }) => Promise<{ ok: boolean; error?: string }>
  /** DQ-M1 Mode A: template CSV → unallocated TrustTransactions + CsvImportBatch. */
  importTrustTemplateCsv: (params: {
    agencyId: string
    actorUserId: string
    filename: string
    csvText: string
  }) => Promise<{
    ok: boolean
    error?: string
    imported: number
    duplicates: number
    parseErrors: string[]
    batchId?: string
  }>
  /** DQ-M2: create/upsert a held deposit (durable Mode A persist). */
  upsertHeldDeposit: (params: {
    agencyId: string
    actorUserId: string
    occupancyId: string
    expectedCents: number
    heldCents: number
    depositId?: string
    statutoryDeadlineOn?: string | null
  }) => Promise<{ ok: boolean; error?: string; depositId?: string }>
  /** DQ-M2: propose deposit release (held → release_proposed). */
  proposeDepositRelease: (params: {
    depositId: string
    actorUserId: string
  }) => Promise<{ ok: boolean; error?: string }>
  /** DQ-M2: dual-control approve deposit release (proposer ≠ approver). */
  approveDepositRelease: (params: {
    depositId: string
    approverUserId: string
  }) => Promise<{ ok: boolean; error?: string }>
  /** D2: reject a proposed release (approver ≠ proposer, reason required) → held. */
  rejectDepositRelease: (params: {
    depositId: string
    actorUserId: string
    reason: string
  }) => Promise<{ ok: boolean; error?: string }>
  /** D2: cancel a proposed or approved release (proposer or trust approver) → held. */
  cancelDepositRelease: (params: {
    depositId: string
    actorUserId: string
    reason?: string
  }) => Promise<{ ok: boolean; error?: string }>
  /** D2: record a refund split (release_approved → refunded). Records only; no money moves. */
  recordDepositRefund: (params: {
    depositId: string
    actorUserId: string
    refundedCents: number
    interestCents: number
    deductions: { reason: string; amountCents: number }[]
  }) => Promise<{ ok: boolean; error?: string }>
  /** DQ-M2 optional: durable propose payout instruction. */
  proposePayoutInstruction: (params: {
    agencyId: string
    actorUserId: string
    occupancyId?: string | null
    propertyId: string
    payeeType?: string
    payeeId: string
    bankAccountId?: string
    amountCents: number
    bucketCode?: string
    idempotencyKey?: string
  }) => Promise<{ ok: boolean; error?: string; instructionId?: string }>
  /** P0-7 / DQ-M2: dual-control payout approval — proposer ≠ approver; awaits persist. */
  approvePayoutInstruction: (params: {
    instructionId: string
    approverUserId: string
  }) => Promise<{ ok: boolean; error?: string }>
  /** P0-7 / DQ-M2: submit approved payout → submitted only (≠ settled); awaits persist. */
  submitPayoutInstruction: (params: {
    instructionId: string
    actorUserId: string
  }) => Promise<{ ok: boolean; error?: string }>
  runClientBillingCycle: (
    clientId: string,
    periodStart?: string,
    periodEnd?: string,
    extraLineItems?: InvoiceLineItem[],
  ) => PlatformInvoice | null
  markInvoicePaid: (invoiceId: string) => void
  toasts: NotificationToast[]
}

/** API mode never starts from seed trust/charge books (spec-portal-first-load). */
const LIVE_DATA_MODE = isApiEnabled

export const defaultStateFor = (_liveDataMode: boolean): AppState => ({
  agencies: [],
  users: [],
  properties: [],
  buildings: [],
  units: [],
  infraRooms: [],
  internalAssets: [],
  lookups: [],
  leads: [],
  applications: [],
  viewingSlots: [],
  viewings: [],
  payments: [],
  tenancies: [],
  threads: [],
  messages: [],
  notifications: [],
  notificationBroadcasts: [],
  suiteAlerts: buildDefaultSuiteAlerts(null),
  tickets: [],
  activities: [],
  propertyDocuments: [],
  propertyEvents: [],
  reviews: [],
  billingPlans: SEED_BILLING_PLANS,
  clientSubscriptions: [],
  invoices: [],
  vendorRoutes: SEED_VENDOR_ROUTES,
  agencyContractors: [],
  // Trust / Banking module state
  trustTransactions: [],
  trustAllocations: [],
  payoutInstructions: [],
  depositHoldings: [],
  arrearsSnapshots: [],
  charges: [],
  csvImportBatches: [],
  supportTickets: [],
  publicMarketplaceFetchFailed: false,
  marketplaceRefreshing: false,
  publicMarketplaceSettled: false,
  sessionRefreshing: false,
  idMapCache: null,
})

const defaultState = (): AppState => defaultStateFor(LIVE_DATA_MODE)

/**
 * Load the owner-keyed cache. Returns defaultState() when the cache belongs to
 * someone other than the stored auth user (or is a legacy untagged blob).
 */
export function loadState(): AppState {
  const base = defaultState()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    let parsed: Partial<AppState> | null
    if (LIVE_DATA_MODE) {
      parsed = readOwnedClientCache<AppState>(raw, readStoredAuthUserId())
    } else {
      // Demo / no-API mode: unkeyed cache, exactly as on main.
      parsed = raw ? (JSON.parse(raw) as Partial<AppState>) : null
    }
    if (!parsed) return base
    return {
      ...base,
      ...parsed,
      publicMarketplaceSettled: false,
      buildings: parsed.buildings ?? base.buildings,
      units: parsed.units ?? base.units,
      infraRooms: parsed.infraRooms ?? base.infraRooms,
      internalAssets: parsed.internalAssets ?? base.internalAssets,
      lookups: parsed.lookups ?? base.lookups,
      billingPlans: parsed.billingPlans?.length ? parsed.billingPlans : base.billingPlans,
      clientSubscriptions: parsed.clientSubscriptions ?? base.clientSubscriptions,
      invoices: parsed.invoices ?? base.invoices,
      vendorRoutes: parsed.vendorRoutes?.length ? parsed.vendorRoutes : base.vendorRoutes,
      agencyContractors: parsed.agencyContractors?.length
        ? parsed.agencyContractors
        : base.agencyContractors,
      propertyDocuments: parsed.propertyDocuments ?? base.propertyDocuments,
      propertyEvents: parsed.propertyEvents ?? base.propertyEvents,
      reviews: parsed.reviews ?? base.reviews,
      suiteAlerts: parsed.suiteAlerts?.length ? parsed.suiteAlerts : base.suiteAlerts,
      notifications: parsed.notifications ?? base.notifications,
      notificationBroadcasts: parsed.notificationBroadcasts ?? base.notificationBroadcasts,
      agencies: (parsed.agencies ?? base.agencies).map((a) => ({
        ...a,
        enabledPermissions:
          'enabledPermissions' in a && Array.isArray(a.enabledPermissions) && a.enabledPermissions.length
            ? a.enabledPermissions
            : [...DEFAULT_AGENCY_PERMISSIONS],
      })),
      users: parsed.users ?? base.users,
      properties: parsed.properties ?? base.properties,
      applications: (parsed.applications ?? base.applications).map(normalizeApplication),
    }
  } catch {
    return base
  }
}

const StoreContext = createContext<StoreContextValue | null>(null)

function priorTenantApplicationCount(
  applications: Application[],
  sessionUserId: string | null | undefined,
): number {
  if (!sessionUserId) return 0
  return applications.filter((a) => a.applicantUserId === sessionUserId).length
}

function bootstrapHasPublicMarketplaceRows(
  pub: { properties?: unknown[]; units?: unknown[] } | null,
): boolean {
  if (!pub) return false
  return Boolean(pub.properties?.length || pub.units?.length)
}

async function fetchGuestMarketplaceBootstrap(
  lite: boolean,
  fullTimeoutMs: number,
): Promise<import('../lib/api/postgresClient').PostgresBootstrap> {
  const { fetchPublicMarketplaceFromApi } = await import('../lib/api/postgresClient')
  const pub = await fetchPublicMarketplaceFromApi(fullTimeoutMs, lite)
  if (bootstrapHasPublicMarketplaceRows(pub)) return pub!
  return emptyPublicMarketplaceBootstrapWithReason(pub === null)
}

async function fetchBootstrapFromApi(
  lite: boolean,
  actor: DemoActor | null,
  fullTimeoutMs = 10_000,
  _hydrateOpts?: { priorTenantApplicationCount?: number },
) {
  // Prefer live Auth actor when callers still pass mount-time null.
  const apiActor = getApiActor()
  const effective =
    actor?.userId && actor.role
      ? actor
      : apiActor?.userId && apiActor.role
        ? apiActor
        : actor
  const guest = !effective?.userId && !readStoredAuthUserId()

  const { fetchPostgresBootstrap } = await import('../lib/api/postgresClient')
  if (guest) {
    return fetchGuestMarketplaceBootstrap(lite, fullTimeoutMs)
  }
  const boot = await fetchPostgresBootstrap(fullTimeoutMs, effective, lite)
  if (!boot) return null
  return enrichBootstrapWithPublicMarketplace(boot, lite, fullTimeoutMs)
}

function ensurePublicMarketplace(state: AppState): AppState {
  return state
}

/** A marketplace load finished (rows, empty, or failed): pages may now show their empty state. */
function settleMarketplace(state: AppState): AppState {
  return state.publicMarketplaceSettled ? state : { ...state, publicMarketplaceSettled: true }
}

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(() => defaultState())
  const [toasts, setToasts] = useState<NotificationToast[]>([])
  /** Session user whose /api/bootstrap has been applied (null until then). */
  const [hydratedForUserId, setHydratedForUserIdState] = useState<string | null>(null)
  /** Same value, readable synchronously by the cache writer (owner of in-memory data). */
  const hydratedForUserIdRef = useRef<string | null>(null)
  const setHydratedForUserId = useCallback((id: string | null) => {
    hydratedForUserIdRef.current = id
    setHydratedForUserIdState(id)
    void import('../lib/auth/writeGate').then(({ setWriteGateHydration }) => setWriteGateHydration(id))
  }, [])
  /** Signed-in bootstrap failed: portals show a retry state, not an endless skeleton. */
  const [hydrationFailed, setHydrationFailed] = useState(false)
  const stateRef = useRef(state)
  /** Pending tenancy saves carrying a freshly issued e-sign envelope, by tenancy id. */
  const leaseESignSaves = useRef(new Map<string, Promise<boolean>>())
  stateRef.current = state

  useEffect(() => {
    let cancelled = false
    const id = window.requestAnimationFrame(() => {
      try {
        // G01–G03: legacy localStorage never carries portfolio rows in live mode.
        // Session snapshot (owner-keyed) restores last workspace view until bootstrap lands.
        const loaded = loadState()
        const authUser = readStoredAuthUserId()
        const snapshotReady = Boolean(authUser && hasPortfolioSnapshotForUser(authUser))
        const liveBase = LIVE_DATA_MODE
          ? snapshotReady
            ? loaded
            : {
                ...loaded,
                properties: [],
                units: [],
                buildings: [],
                viewingSlots: [],
                leads: [],
                tickets: [],
              }
          : loaded
        const seeded = LIVE_DATA_MODE
          ? mergePortfolioSnapshotIntoState(
              liveBase,
              authUser,
              portfolioSnapshotActor(getApiActor()),
            )
          : loaded
        const cached = ensurePublicMarketplace(seeded)
        if (!cancelled) setState(cached)
      } catch {
        /* keep defaultState */
      }
    })
    return () => {
      cancelled = true
      window.cancelAnimationFrame(id)
    }
  }, [])

  /**
   * After a lite bootstrap lands: fetch the full one when the browser is idle
   * and merge it in (heavy collections the lite payload leaves out).
   */
  const scheduleFullBootstrapMerge = useCallback((isCancelled: () => boolean = () => false) => {
    scheduleDeferredFullBootstrap(() => {
      if (isCancelled()) return
      // Re-resolve at run time — do not close over a mount-time null actor.
      const deferredActor = resolveBootstrapActor(stateRef.current.users)
      const deferredKey = bootstrapActorKey(deferredActor)
      void dedupeBootstrapFetch(
        false,
        () => fetchBootstrapFromApi(false, deferredActor, 25_000),
        { actorKey: deferredKey },
      ).then((full) => {
        if (isCancelled() || !full) return
        if (!bootstrapMatchesSession(deferredActor?.userId, readStoredAuthUserId())) return
        setState((prev) => {
          const next = settleMarketplace(ensurePublicMarketplace(applyPostgresBootstrap(prev, full)))
          const uid = deferredActor?.userId ?? readStoredAuthUserId()
          if (uid) {
            writePortfolioSnapshotFromState(
              uid,
              next,
              portfolioSnapshotActor(full.actor ?? deferredActor ?? getApiActor()),
            )
          }
          return next
        })
      })
    })
  }, [])

  const refreshBootstrap = useCallback(
    async (
      actor?: DemoActor | null,
      opts?: { full?: boolean; force?: boolean; ingestNotifications?: boolean },
    ) => {
    if (opts?.force) {
      setHydrationFailed(false)
      resetBootstrapCoordForRetry()
    }

    const resolved =
      actor === undefined
        ? resolveBootstrapActor(stateRef.current.users)
        : resolveBootstrapActor(stateRef.current.users, actor)
    const lite = !opts?.full
    const actorKey = bootstrapActorKey(resolved)
    const sessionForPrior = resolved?.userId ?? readStoredAuthUserId()
    const priorApps = priorTenantApplicationCount(stateRef.current.applications, sessionForPrior)
    const fetchBoot = () =>
      fetchBootstrapFromApi(lite, resolved, opts?.full ? 25_000 : 20_000, {
        priorTenantApplicationCount: priorApps,
      })
    const prevNotifications = stateRef.current.notifications
    const prevSuiteAlerts = stateRef.current.suiteAlerts
    const ingestUserId = opts?.ingestNotifications ? resolved?.userId : undefined

    if (!isApiEnabled) {
      setState((prev) => settleMarketplace(ensurePublicMarketplace(prev)))
      return
    }

    let boot = await dedupeBootstrapFetch(lite, fetchBoot, { force: opts?.force, actorKey })
    const storedAuth = readStoredAuthUserId()
    if (!boot && lite && !opts?.full && (resolved?.userId || storedAuth)) {
      boot = await dedupeBootstrapFetch(
        false,
        () => fetchBootstrapFromApi(false, resolved, 25_000),
        { force: opts?.force, actorKey },
      )
    }
    if (!boot) {
      setTicketAccessNotesSupported(false)
      const stored = storedAuth
      if (stored && hydratedForUserIdRef.current === stored) {
        setState((prev) => settleMarketplace(ensurePublicMarketplace(prev)))
        return
      }
      if (
        shouldIgnoreBootstrapMissAfterFetch({
          force: opts?.force,
          sessionUserId: resolved?.userId ?? stored,
          hydratedForUserId: hydratedForUserIdRef.current,
        })
      ) {
        setState((prev) => settleMarketplace(ensurePublicMarketplace(prev)))
        return
      }
      if (resolved?.userId || stored) setHydrationFailed(true)
      setState((prev) => settleMarketplace(ensurePublicMarketplace(prev)))
      return
    }
    // Drop a bootstrap whose user is no longer the session user (switch mid-flight).
    const sessionUserId = bootstrapSessionUserId(resolved?.userId, boot.actor?.userId)
    const storedAfterBoot = readStoredAuthUserId()
    if (
      !canApplyBootstrapHydration({
        sessionUserId,
        storedAuthUserId: storedAfterBoot,
        bootActorUserId: boot.actor?.userId,
      })
    ) {
      if (resolved?.userId || storedAfterBoot) setHydrationFailed(true)
      return
    }
    setTicketAccessNotesSupported(ticketAccessNotesSupportedFromBootstrap(boot))
    setState((prev) => {
      const next = settleMarketplace(ensurePublicMarketplace(applyPostgresBootstrap(prev, boot)))
      if (sessionUserId) {
        writePortfolioSnapshotFromState(
          sessionUserId,
          next,
          portfolioSnapshotActor(boot.actor ?? resolved),
        )
      }
      return next
    })
    setHydratedForUserId(sessionUserId)
    setHydrationFailed(false)
    markBootstrapFetched(true, actorKey)
    if (ingestUserId) {
      const nextNotes = (boot.notifications as AppNotification[]) ?? []
      const fresh = diffNewNotifications(prevNotifications, nextNotes, ingestUserId)
      const newToasts = toastsForNewNotifications(fresh, prevSuiteAlerts)
      if (newToasts.length) {
        setToasts((prev) =>
          [...newToasts, ...prev.filter((t) => !newToasts.some((n) => n.notificationId === t.notificationId))].slice(
            0,
            6,
          ),
        )
      }
    }
    try {
      localStorage.setItem(PG_HYDRATED_FLAG, 'postgres')
    } catch {
      /* ignore */
    }
    if (!opts?.full && isApiEnabled) scheduleFullBootstrapMerge()
  },
  [scheduleFullBootstrapMerge],
)

  useEffect(() => {
    if (!isApiEnabled) {
      setState((prev) => settleMarketplace(ensurePublicMarketplace(prev)))
      return
    }
    let cancelled = false
    // A live session never waits on the idle deferral: cached rows must not be
    // the only data on screen for a signed-in user (spec-portal-first-load).
    const hasCachedHydration = shouldDeferMountBootstrap({
      storedAuthUserId: readStoredAuthUserId(),
      pgSource: localStorage.getItem(PG_HYDRATED_FLAG),
      cachedPropertyCount: stateRef.current.properties.length,
    })

    const run = async () => {
      const actor = resolveBootstrapActor(stateRef.current.users)
      const actorKey = bootstrapActorKey(actor)
      const sessionForPrior = actor?.userId ?? readStoredAuthUserId()
      const priorApps = priorTenantApplicationCount(stateRef.current.applications, sessionForPrior)
      const hydrateCtx = { priorTenantApplicationCount: priorApps }
      let boot = await dedupeBootstrapFetch(
        true,
        () => fetchBootstrapFromApi(true, actor, 20_000, hydrateCtx),
        { actorKey },
      )
      const storedAuth = readStoredAuthUserId()
      if (!boot && (actor?.userId || storedAuth)) {
        boot = await dedupeBootstrapFetch(
          false,
          () => fetchBootstrapFromApi(false, actor, 25_000, hydrateCtx),
          { actorKey },
        )
      }
      if (cancelled) return
      if (!boot) {
        setTicketAccessNotesSupported(false)
        const stored = storedAuth
        if (stored && hydratedForUserIdRef.current === stored) {
          setState((prev) => settleMarketplace(ensurePublicMarketplace(prev)))
          return
        }
        if (
          shouldIgnoreBootstrapMissAfterFetch({
            sessionUserId: actor?.userId ?? stored,
            hydratedForUserId: hydratedForUserIdRef.current,
          })
        ) {
          setState((prev) => settleMarketplace(ensurePublicMarketplace(prev)))
          return
        }
        if (actor?.userId || stored) setHydrationFailed(true)
        setState((prev) => settleMarketplace(ensurePublicMarketplace(prev)))
        return
      }
      const sessionUserId = bootstrapSessionUserId(actor?.userId, boot.actor?.userId)
      const storedAfterBoot = readStoredAuthUserId()
      if (
        !canApplyBootstrapHydration({
          sessionUserId,
          storedAuthUserId: storedAfterBoot,
          bootActorUserId: boot.actor?.userId,
        })
      ) {
        if (actor?.userId || storedAfterBoot) setHydrationFailed(true)
        return
      }
      setTicketAccessNotesSupported(ticketAccessNotesSupportedFromBootstrap(boot))
      setState((prev) => {
        const next = settleMarketplace(ensurePublicMarketplace(applyPostgresBootstrap(prev, boot)))
        if (sessionUserId) {
          writePortfolioSnapshotFromState(
            sessionUserId,
            next,
            portfolioSnapshotActor(boot.actor ?? actor),
          )
        }
        return next
      })
      setHydratedForUserId(sessionUserId)
      setHydrationFailed(false)
      markBootstrapFetched(true, actorKey)
      try {
        localStorage.setItem(PG_HYDRATED_FLAG, 'postgres')
      } catch {
        /* ignore */
      }
      console.info(
        '[AppStore] hydrated from Postgres',
        boot.fetchedAt,
        boot.scoped ? `(scoped ${boot.actor?.userId})` : '(full/agency)',
      )
      scheduleFullBootstrapMerge(() => cancelled)
    }

    if (hasCachedHydration) {
      scheduleDeferredFullBootstrap(() => {
        if (!cancelled) void run()
      })
    } else {
      void run()
    }

    return () => {
      cancelled = true
    }
  }, [])

  const resetToDefault = useCallback(() => {
    cacheWriterRef.current?.cancel()
    clearPortfolioSnapshot()
    const fresh = defaultState()
    stateRef.current = fresh
    setState(fresh)
    setHydratedForUserId(null)
    setHydrationFailed(false)
    setToasts([])
  }, [setHydratedForUserId])

  // Cache owner = user whose data is in memory (hydratedForUserIdRef), captured at
  // schedule time; written only while that user is still the stored auth user.
  const cacheWriterRef = useRef<ReturnType<typeof createClientCacheWriter<AppState>> | null>(null)
  if (!cacheWriterRef.current) {
    cacheWriterRef.current = createClientCacheWriter<AppState>({
      delayMs: 900,
      liveMode: LIVE_DATA_MODE,
      getMemoryOwner: () => hydratedForUserIdRef.current,
      getStoredAuthUser: readStoredAuthUserId,
      write: (st, owner) => {
        try {
          localStorage.setItem(
            STORAGE_KEY,
            LIVE_DATA_MODE ? serializeClientCache(st, owner, LIVE_DATA_MODE) : JSON.stringify(st),
          )
          if (owner) writePortfolioSnapshotFromState(owner, st, portfolioSnapshotActor(getApiActor()))
        } catch {
          /* ignore quota errors */
        }
      },
    })
  }
  useEffect(() => {
    const writer = cacheWriterRef.current!
    writer.schedule(state)
    return () => writer.cancel()
  }, [state])
  useEffect(() => {
    if (!LIVE_DATA_MODE) return // demo mode: as on main
    // Another tab signed out (auth key removed): cancel pending write + reset store.
    const onStorage = (e: StorageEvent) => {
      handleAuthKeyStorageEvent(e, {
        cancel: () => cacheWriterRef.current?.cancel(),
        reset: resetToDefault,
      })
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [resetToDefault])

  const patch = useCallback((fn: (s: AppState) => AppState) => {
    // P0-publish (R8): keep stateRef in sync synchronously. Same-tick flows
    // (wizard create → publish; approve → persist) read stateRef.current
    // before React has re-rendered — a stale ref there made publish see the
    // pre-create/presave state and drop or duplicate the persist.
    setState((s) => {
      const next = fn(s)
      stateRef.current = next
      return next
    })
  }, [])

  /**
   * Apply a patch to lookup rows and return the rows to persist. Built-in
   * (global) rows are shared by every agency, so with `forAgencyId` they are
   * saved as that agency's override; without it they are left unchanged.
   */
  const writeLookupRows = useCallback(
    (
      rows: LookupConfig[],
      patchFor: (row: LookupConfig) => Partial<LookupConfig>,
      forAgencyId?: string | null,
    ): LookupConfig[] => {
      const current = stateRef.current.lookups
      const saved: LookupConfig[] = []
      for (const row of rows) {
        if (row.clientId !== GLOBAL_CLIENT_ID) saved.push({ ...row, ...patchFor(row) })
        else if (forAgencyId) saved.push(agencyOverrideFor(current, row, forAgencyId, patchFor(row)))
      }
      if (!saved.length) return saved
      patch((s) => {
        const byId = new Map(saved.map((r) => [r.id, r]))
        const kept = s.lookups.map((l) => byId.get(l.id) ?? l)
        const added = saved.filter((r) => !s.lookups.some((l) => l.id === r.id))
        return { ...s, lookups: [...kept, ...added] }
      })
      return saved
    },
    [patch],
  )

  const sessionRefreshIdRef = useRef(0)
  const marketplaceRefreshIdRef = useRef(0)

  const refreshSessionData = useCallback(
    async (opts?: { full?: boolean; force?: boolean; ingestNotifications?: boolean }) => {
      if (!LIVE_DATA_MODE) return
      const requestId = ++sessionRefreshIdRef.current
      patch((s) => ({ ...s, sessionRefreshing: true }))
      try {
        const actor = resolveBootstrapActor(stateRef.current.users)
        await refreshBootstrap(actor, {
          force: opts?.force ?? true,
          full: opts?.full,
          ingestNotifications: opts?.ingestNotifications,
        })
      } finally {
        if (shouldApplyRefreshResult(requestId, sessionRefreshIdRef.current)) {
          patch((s) => ({ ...s, sessionRefreshing: false }))
        }
      }
    },
    [patch, refreshBootstrap],
  )

  const refreshMarketplaceListings = useCallback(
    async (opts?: { force?: boolean }) => {
      if (!LIVE_DATA_MODE) return
      const requestId = ++marketplaceRefreshIdRef.current
      patch((s) => ({ ...s, marketplaceRefreshing: true }))
      try {
        const stored = readStoredAuthUserId()
        const apiActor = getApiActor()
        const isGuest = !stored && !apiActor?.userId
        const current = stateRef.current

        if (isGuest) {
          const boot = await dedupeBootstrapFetch(
            true,
            () => fetchGuestMarketplaceBootstrap(true, 15_000),
            { force: opts?.force ?? true },
          )
          if (!shouldApplyRefreshResult(requestId, marketplaceRefreshIdRef.current)) {
            return
          }
          if (!boot) {
            patch((s) => ({
              ...s,
              publicMarketplaceFetchFailed: true,
              marketplaceRefreshing: false,
            }))
            return
          }
          patch((s) => ({
            ...settleMarketplace(ensurePublicMarketplace(applyPostgresBootstrap(s, boot))),
            publicMarketplaceFetchFailed: Boolean(boot.marketplaceFetchFailed),
            marketplaceRefreshing: false,
          }))
          return
        }

        const slice = await fetchMergedPublicMarketplaceSlice({
          properties: current.properties,
          units: current.units,
          users: current.users,
          buildings: current.buildings,
          viewingSlots: current.viewingSlots,
          agencies: current.agencies,
        })
        if (!slice || !shouldApplyRefreshResult(requestId, marketplaceRefreshIdRef.current)) {
          return
        }
        patch((s) => ({
          ...s,
          properties: mergeEntityLists(s.properties, slice.properties, 'properties', {
            replaceWhenMissing: false,
          }),
          units: mergeEntityLists(s.units, slice.units, 'units', { replaceWhenMissing: false }),
          users: mergeEntityLists(s.users, slice.users, 'users', { replaceWhenMissing: false }),
          buildings: mergeEntityLists(s.buildings, slice.buildings, 'buildings', {
            replaceWhenMissing: false,
          }),
          viewingSlots: mergeEntityLists(s.viewingSlots, slice.viewingSlots, 'viewingSlots', {
            replaceWhenMissing: false,
          }),
          agencies: mergeEntityLists(s.agencies, slice.agencies as Agency[], 'agencies', {
            replaceWhenMissing: false,
          }),
          marketplaceRefreshing: false,
        }))
      } finally {
        if (shouldApplyRefreshResult(requestId, marketplaceRefreshIdRef.current)) {
          patch((s) => ({ ...s, marketplaceRefreshing: false, publicMarketplaceSettled: true }))
        }
      }
    },
    [patch],
  )

  const refreshPublicMarketplaceInState = useCallback(async () => {
    await refreshMarketplaceListings({ force: true })
  }, [refreshMarketplaceListings])

  const refreshAfterMutationRef = useRef<number | null>(null)
  const scheduleBootstrapRefreshAfterMutation = useCallback(() => {
    if (refreshAfterMutationRef.current != null) {
      window.clearTimeout(refreshAfterMutationRef.current)
    }
    refreshAfterMutationRef.current = window.setTimeout(() => {
      refreshAfterMutationRef.current = null
      void refreshSessionData({ force: true })
    }, 1500)
  }, [refreshSessionData])

  /** Durable persist for mutation paths that must gate success UI on a
   *  committed write. Marks the local write (so a concurrent bootstrap refresh
   *  keeps the optimistic row) and performs ONE server write — not a queued
   *  duplicate plus an awaited one. Resolves false when the write rejected
   *  (RLS, constraint, network) so callers can surface the real error. */
  const persistUpsertResult = useCallback(
    async (
      resource: Parameters<typeof queueUpsert>[0],
      id: string,
      data: Record<string, unknown>,
    ): Promise<import('../lib/api/persist').PersistApiResult> => {
      try {
        const { canPersistWrites, PERSIST_WRITE_GATE_MESSAGE } = await import('../lib/auth/writeGate')
        const { readStoredAuthUserId, getApiActor } = await import('../lib/api/actorAuth')
        const sessionUserId = getApiActor()?.userId ?? readStoredAuthUserId()
        if (!canPersistWrites(hydratedForUserIdRef.current, sessionUserId)) {
          return { ok: false, error: PERSIST_WRITE_GATE_MESSAGE }
        }
        const { markLocalPersistWrite } = await import('../lib/bootstrapMerge')
        markLocalPersistWrite(resource, id)
        const { persistToApiDetailed } = await import('../lib/api/persist')
        const result = await persistToApiDetailed({
          resource,
          action: 'upsert',
          id,
          data: { ...data, id },
        })
        if (
          result.ok &&
          (resource === 'user' ||
            resource === 'agency' ||
            resource === 'building' ||
            resource === 'unit' ||
            resource === 'property' ||
            resource === 'lead' ||
            resource === 'application' ||
            resource === 'viewing' ||
            resource === 'viewing_slot' ||
            resource === 'ticket')
        ) {
          scheduleBootstrapRefreshAfterMutation()
        }
        return result
      } catch {
        return { ok: false, error: 'Could not save. Try again.' }
      }
    },
    [scheduleBootstrapRefreshAfterMutation],
  )

  const persistUpsert = useCallback(
    async (
      resource: Parameters<typeof queueUpsert>[0],
      id: string,
      data: Record<string, unknown>,
    ): Promise<boolean> => {
      const result = await persistUpsertResult(resource, id, data)
      return result.ok
    },
    [persistUpsertResult],
  )

  const persistApplicationOrRollback = useCallback(
    async (
      applicationId: string,
      nextApp: Application,
      previousApp: Application | null | undefined,
      userMessage?: { title: string; text?: string },
    ): Promise<boolean> => {
      const ok = await persistUpsert(
        'application',
        applicationId,
        nextApp as unknown as Record<string, unknown>,
      )
      if (ok) return true
      if (previousApp) {
        patch((s) => ({
          ...s,
          applications: s.applications.map((a) => (a.id === applicationId ? previousApp : a)),
        }))
      }
      if (userMessage) {
        const { sweetError } = await import('../lib/sweetAlert')
        await sweetError(userMessage.title, userMessage.text)
      }
      return false
    },
    [persistUpsert, patch],
  )

  /**
   * P0-approve (R7): the deployed approve_application RPC cannot commit — its
   * leases INSERT omits the NOT NULL lease_reference column, so every call
   * aborts with "null value in column lease_reference" (HTTP 400). Until a DB
   * migration can change that (no DB access in this fix), the direct mirror
   * writes below ARE the durable transition. This helper runs them in order
   * and only reports success when every write committed, replacing the old
   * single-shot RPC gate that turned the whole approve into a 502.
   */
  const persistApprovedApplication = useCallback(
    async (input: {
      applicationId: string
      application: Application
      lease: Tenancy | null
      payments: PaymentRecord[]
      notifications: AppNotification[]
    }): Promise<boolean> => {
      // Mode A Sipho: repair null applicant/tenant from email → store users before persist.
      // Fail-closed if lease still has no tenantUserId after repair — no orphan PENDING.
      let application = input.application
      let lease = input.lease
      if (lease && !lease.tenantUserId) {
        const email = (lease.tenantEmail || application.email || '').trim().toLowerCase()
        const matched = email
          ? stateRef.current.users.find((u) => u.email?.toLowerCase() === email)
          : undefined
        if (matched) {
          lease = { ...lease, tenantUserId: matched.id }
          if (!application.applicantUserId) {
            application = { ...application, applicantUserId: matched.id }
          }
          patch((s) => ({
            ...s,
            applications: s.applications.map((a) =>
              a.id === application.id ? { ...a, applicantUserId: matched.id } : a,
            ),
            tenancies: s.tenancies.map((t) =>
              t.id === lease!.id ? { ...t, tenantUserId: matched.id } : t,
            ),
          }))
        } else {
          return false
        }
      }
      const applicationOk = await persistUpsert(
        'application',
        input.applicationId,
        application as unknown as Record<string, unknown>,
      )
      if (!applicationOk) return false
      if (lease) {
        if (!lease.tenantUserId) return false
        const leaseOk = await persistUpsert(
          'tenancy',
          lease.id,
          lease as unknown as Record<string, unknown>,
        )
        if (!leaseOk) return false
      }
      for (const pay of input.payments) {
        const payOk = await persistUpsert('payment', pay.id, pay as unknown as Record<string, unknown>)
        if (!payOk) return false
      }
      for (const n of input.notifications) {
        await persistUpsert('notification', n.id, n as unknown as Record<string, unknown>)
      }
      return true
    },
    [persistUpsert, patch],
  )

  /**
   * Roadmap Step 5: on durable tenancy create (approve), generate a real lease
   * PDF, store PropertyDocument category Lease, and open an e-sign envelope
   * (mock by default — live partners refuse without keys).
   */
  const issueLeasePackageForTenancy = useCallback(
    async (
      lease: Tenancy,
      actor?: { userId?: string | null; name?: string | null },
    ): Promise<Tenancy> => {
      if (lease.eSign?.envelopeId || lease.leaseDocumentId) {
        return lease
      }
      const s = stateRef.current
      const property = s.properties.find((p) => p.id === lease.propertyId)
      const agency = s.agencies.find((a) => a.id === lease.agencyId)
      const landlordUser = lease.landlordId
        ? s.users.find((u) => u.id === lease.landlordId) ?? null
        : null
      const documentId = uid('PD')
      const issued = await issueLeaseOnTenancyCreate({
        tenancy: lease,
        property,
        agencyName: agency?.name ?? 'Agency',
        landlordUser,
        documentId,
        actorUserId: actor?.userId,
        actorName: actor?.name,
      })
      if (!issued.ok || !issued.document || !issued.eSign) {
        return lease
      }
      const nextLease: Tenancy = { ...lease, ...issued.tenancyPatch }
      patch((prev) => ({
        ...prev,
        propertyDocuments: [issued.document!, ...prev.propertyDocuments],
        tenancies: prev.tenancies.map((t) => (t.id === lease.id ? nextLease : t)),
      }))
      persistUpsert('document', issued.document.id, issued.document as unknown as Record<string, unknown>)
      // The SigniFlow status poll checks the stored lease owns the envelope,
      // so a sign right after issue waits for this save (recordTenancyLeaseSign).
      leaseESignSaves.current.set(
        nextLease.id,
        Promise.resolve(
          persistUpsert('tenancy', nextLease.id, nextLease as unknown as Record<string, unknown>),
        ).then((ok) => ok !== false),
      )
      const pe: PropertyEvent = {
        id: uid('pe'),
        agencyId: nextLease.agencyId,
        propertyId: nextLease.propertyId,
        actorUserId: actor?.userId ?? null,
        actorName: actor?.name ?? 'System',
        action: 'generated lease PDF + e-sign envelope',
        at: new Date().toISOString(),
        changes: [
          { field: 'Document', from: 'None', to: issued.document.name },
          {
            field: 'E-sign',
            from: 'None',
            to: `${issued.eSign.status} (${issued.eSign.provider}${
              issued.eSign.nonProduction ? ', non-production' : ''
            })`,
          },
        ],
      }
      patch((prev) => ({
        ...prev,
        propertyEvents: [pe, ...prev.propertyEvents].slice(0, 400),
      }))
      persistUpsert('property_event', pe.id, pe as unknown as Record<string, unknown>)
      return nextLease
    },
    [patch, persistUpsert],
  )
  const persistDelete = useCallback((resource: Parameters<typeof queueDelete>[0], id: string) => {
    queueDelete(resource, id)
  }, [])

  const pushToast = useCallback((toast: NotificationToast) => {
    setToasts((prev) => [toast, ...prev.filter((t) => t.notificationId !== toast.notificationId)].slice(0, 6))
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  // A write the server refused with a policy code (e.g. an applicant moving
  // their application to a stage they may not set) is shown, and the store
  // reloads server truth so the optimistic change does not linger.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onRefused = (e: Event) => {
      const detail = (e as CustomEvent<PersistRefusal>).detail
      if (!detail) return
      pushToast({
        id: uid('toast'),
        notificationId: `persist-refused-${detail.resource}-${detail.id}-${Date.now()}`,
        userId: '',
        title: 'Change not saved',
        body: persistRefusalMessage(detail, getApiActor()?.role ?? null),
        durationMs: 8000,
        createdAt: Date.now(),
        tone: 'danger',
      })
      scheduleBootstrapRefreshAfterMutation()
    }
    window.addEventListener(PERSIST_REFUSED_EVENT, onRefused)
    return () => window.removeEventListener(PERSIST_REFUSED_EVENT, onRefused)
  }, [pushToast, scheduleBootstrapRefreshAfterMutation])

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
      queueUpsert('activity', activity.id, activity as unknown as Record<string, unknown>)
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
      queueUpsert('property_event', event.id, event as unknown as Record<string, unknown>)
      return event
    },
    [patch],
  )


  // ——— Trust / Banking mutations (P0-7) — every one writes an audit trail ———

  const allocateTrustReceipt = useCallback(
    async (params: {
      transactionId: string
      actorUserId: string
      lines: Array<{ occupancyId: string; bucketCode: string; amountCents: number }>
    }) => {
      const txn = stateRef.current.trustTransactions.find((t) => t.id === params.transactionId)
      const actor = stateRef.current.users.find((u) => u.id === params.actorUserId)
      if (!txn || !actor) return { ok: false, error: 'Transaction or actor not found' }
      if (txn.status !== 'unallocated' && txn.status !== 'received' && txn.status !== 'recognised') {
        return { ok: false, error: `Transaction is already ${txn.status}` }
      }
      const total = params.lines.reduce((sum, l) => sum + l.amountCents, 0)
      if (total <= 0) return { ok: false, error: 'Allocate at least one line' }
      if (total > txn.amountCents) return { ok: false, error: 'Allocation exceeds the receipt amount' }

      const now = new Date().toISOString()
      const newAllocations: TrustAllocation[] = params.lines.map((l) => ({
        id: uid('ta'),
        agencyId: txn.agencyId,
        trustTransactionId: txn.id,
        occupancyId: l.occupancyId,
        bucketCode: l.bucketCode,
        chargeId: null,
        amountCents: l.amountCents,
        allocatedBy: actor.id,
        allocatedAt: now,
      }))
      const fullyAllocated = total === txn.amountCents
      const nextStatus = fullyAllocated ? ('allocated' as const) : ('split_allocated' as const)
      patch((s) => ({
        ...s,
        trustAllocations: [...newAllocations, ...s.trustAllocations],
        trustTransactions: s.trustTransactions.map((t) =>
          t.id === txn.id
            ? {
                ...t,
                status: nextStatus,
                updatedAt: now,
              }
            : t,
        ),
      }))
      const undo = () =>
        patch((s) => ({
          ...s,
          trustAllocations: s.trustAllocations.filter((a) => !newAllocations.some((n) => n.id === a.id)),
          trustTransactions: s.trustTransactions.map((t) => (t.id === txn.id ? txn : t)),
        }))
      // Lines first, then the status: a refused line leaves the receipt unallocated.
      const { saved, failed } = await persistInOrder(newAllocations, (a) =>
        persistUpsert('trust_allocation', a.id, a as unknown as Record<string, unknown>),
      )
      if (failed) {
        undo()
        return { ok: false, error: allocationSaveFailedMessage(saved.length, newAllocations.length) }
      }
      const statusSaved = await persistUpsert(
        'trust_transaction',
        txn.id,
        { ...txn, status: nextStatus, updatedAt: now } as unknown as Record<string, unknown>,
      )
      if (!statusSaved) {
        undo()
        return {
          ok: false,
          error: 'The allocation lines were saved but the receipt status was not. Refresh the page before allocating again.',
        }
      }
      addActivity(
        `Allocated ${txn.description || txn.id} (${(total / 100).toFixed(2)} ZAR) to ${params.lines.length} bucket${params.lines.length === 1 ? '' : 's'}`,
        actor.name,
        txn.agencyId,
      )
      return { ok: true }
    },
    [patch, addActivity, persistUpsert],
  )

  const markTrustSuspense = useCallback(
    async (params: { transactionId: string; actorUserId: string }) => {
      const txn = stateRef.current.trustTransactions.find((t) => t.id === params.transactionId)
      const actor = stateRef.current.users.find((u) => u.id === params.actorUserId)
      if (!txn || !actor) return { ok: false, error: 'Transaction or actor not found' }
      const now = new Date().toISOString()
      const allocation: TrustAllocation = {
        id: uid('ta'),
        agencyId: txn.agencyId,
        trustTransactionId: txn.id,
        occupancyId: null,
        bucketCode: 'suspense',
        chargeId: null,
        amountCents: txn.amountCents,
        allocatedBy: actor.id,
        allocatedAt: now,
      }
      patch((s) => ({
        ...s,
        trustAllocations: [allocation, ...s.trustAllocations],
        trustTransactions: s.trustTransactions.map((t) =>
          t.id === txn.id ? { ...t, status: 'recognised' as const, updatedAt: now } : t,
        ),
      }))
      const undo = () =>
        patch((s) => ({
          ...s,
          trustAllocations: s.trustAllocations.filter((a) => a.id !== allocation.id),
          trustTransactions: s.trustTransactions.map((t) => (t.id === txn.id ? txn : t)),
        }))
      const lineSaved = await persistUpsert(
        'trust_allocation',
        allocation.id,
        allocation as unknown as Record<string, unknown>,
      )
      if (!lineSaved) {
        undo()
        return { ok: false, error: `Receipt was not moved to suspense. ${TRUST_SAVE_FAILED}` }
      }
      const statusSaved = await persistUpsert(
        'trust_transaction',
        txn.id,
        { ...txn, status: 'recognised', updatedAt: now } as unknown as Record<string, unknown>,
      )
      if (!statusSaved) {
        undo()
        return {
          ok: false,
          error: 'The suspense line was saved but the receipt status was not. Refresh the page before trying again.',
        }
      }
      addActivity(
        `Moved receipt to suspense (aged + alerted): ${txn.description || txn.id}`,
        actor.name,
        txn.agencyId,
      )
      return { ok: true }
    },
    [patch, addActivity, persistUpsert],
  )

  const importTrustTemplateCsv = useCallback(
    async (params: {
      agencyId: string
      actorUserId: string
      filename: string
      csvText: string
    }) => {
      const {
        parseTrustTemplateCsv,
        filterNewTrustCsvRows,
        buildTrustCsvPartnerTxnId,
        TRUST_CSV_NON_PRODUCTION_LABEL,
      } = await import('../lib/trust/csvImport')
      const actor = stateRef.current.users.find((u) => u.id === params.actorUserId)
      if (!actor) {
        return {
          ok: false,
          error: 'Actor not found',
          imported: 0,
          duplicates: 0,
          parseErrors: [] as string[],
        }
      }
      const parsed = parseTrustTemplateCsv(params.csvText)
      if (parsed.rows.length === 0) {
        return {
          ok: false,
          error: parsed.errors[0] ?? 'No importable rows',
          imported: 0,
          duplicates: 0,
          parseErrors: parsed.errors,
        }
      }
      const agencyTxns = stateRef.current.trustTransactions.filter(
        (t) => t.agencyId === params.agencyId,
      )
      const { fresh, duplicateCount } = filterNewTrustCsvRows(parsed.rows, agencyTxns)
      if (fresh.length === 0) {
        return {
          ok: true,
          imported: 0,
          duplicates: duplicateCount,
          parseErrors: parsed.errors,
          error:
            duplicateCount > 0
              ? 'All rows were duplicates (idempotent skip)'
              : undefined,
        }
      }
      const now = new Date().toISOString()
      const batchId = uid('csv')
      const batch: CsvImportBatch = {
        id: batchId,
        agencyId: params.agencyId,
        filename: params.filename || 'template.csv',
        rowCount: fresh.length,
        importedAt: now,
        importedBy: actor.id,
        status: 'completed',
      }
      const newTxns: TrustTransaction[] = fresh.map((row) => {
        const id = uid('tt')
        const partnerTxnId = buildTrustCsvPartnerTxnId(row.idempotencyKey)
        return {
          id,
          agencyId: params.agencyId,
          direction: row.direction,
          amountCents: row.amountCents,
          currency: 'ZAR' as const,
          valueDate: row.valueDate,
          postedAt: now,
          partnerTxnId,
          bankRef: row.bankRef || partnerTxnId,
          description: `${row.description} [${TRUST_CSV_NON_PRODUCTION_LABEL}]`,
          counterpartyHash: null,
          status: 'unallocated' as const,
          rawPayloadDocumentId: null,
          createdAt: now,
          updatedAt: now,
        }
      })
      patch((s) => ({
        ...s,
        csvImportBatches: [batch, ...s.csvImportBatches],
        trustTransactions: [...newTxns, ...s.trustTransactions],
      }))
      const batchSaved = await persistUpsert(
        'csv_import_batch',
        batch.id,
        batch as unknown as Record<string, unknown>,
      )
      if (!batchSaved) {
        patch((s) => ({
          ...s,
          csvImportBatches: s.csvImportBatches.filter((b) => b.id !== batch.id),
          trustTransactions: s.trustTransactions.filter((t) => !newTxns.some((n) => n.id === t.id)),
        }))
        return {
          ok: false,
          error: `Import was not saved. ${TRUST_SAVE_FAILED}`,
          imported: 0,
          duplicates: duplicateCount,
          parseErrors: parsed.errors,
        }
      }
      // Receipts that saved stay (re-importing the file skips them as duplicates).
      const { saved, failed } = await persistInOrder(newTxns, (txn) =>
        persistUpsert('trust_transaction', txn.id, txn as unknown as Record<string, unknown>),
      )
      if (failed) {
        patch((s) => ({
          ...s,
          trustTransactions: s.trustTransactions.filter(
            (t) => !newTxns.some((n) => n.id === t.id) || saved.some((ok) => ok.id === t.id),
          ),
        }))
        if (saved.length > 0) {
          addActivity(
            `Template CSV import: ${saved.length} of ${newTxns.length} receipt(s) saved from ${batch.filename}`,
            actor.name,
            params.agencyId,
          )
        }
        return {
          ok: false,
          error: csvImportSaveFailedMessage(saved.length, newTxns.length),
          imported: saved.length,
          duplicates: duplicateCount,
          parseErrors: parsed.errors,
          batchId,
        }
      }
      addActivity(
        `Template CSV import: ${fresh.length} unallocated receipt(s) from ${batch.filename} (recorded in Lekaya, not yet matched to the bank)`,
        actor.name,
        params.agencyId,
      )
      return {
        ok: true,
        imported: fresh.length,
        duplicates: duplicateCount,
        parseErrors: parsed.errors,
        batchId,
      }
    },
    [patch, addActivity, persistUpsert],
  )

  const upsertHeldDeposit = useCallback(
    async (params: {
      agencyId: string
      actorUserId: string
      occupancyId: string
      expectedCents: number
      heldCents: number
      depositId?: string
      statutoryDeadlineOn?: string | null
    }) => {
      const actor = stateRef.current.users.find((u) => u.id === params.actorUserId)
      if (!actor) return { ok: false, error: 'Actor not found' }
      const now = new Date().toISOString()
      const depositId = params.depositId?.trim() || uid('dh')
      const existing =
        stateRef.current.depositHoldings.find((d) => d.id === depositId) ?? null
      const built = buildHeldDeposit({
        id: depositId,
        agencyId: params.agencyId,
        occupancyId: params.occupancyId,
        expectedCents: params.expectedCents,
        heldCents: params.heldCents,
        statutoryDeadlineOn: params.statutoryDeadlineOn,
        existing,
        now,
      })
      if (built.ok === false) return { ok: false, error: built.error }
      const row = built.value
      patch((s) => ({
        ...s,
        depositHoldings: existing
          ? s.depositHoldings.map((d) => (d.id === row.id ? row : d))
          : [row, ...s.depositHoldings],
      }))
      const saved = await persistUpsert('deposit_holding', row.id, row as unknown as Record<string, unknown>)
      if (!saved) {
        patch((s) => ({
          ...s,
          depositHoldings: existing
            ? s.depositHoldings.map((d) => (d.id === row.id ? existing : d))
            : s.depositHoldings.filter((d) => d.id !== row.id),
        }))
        return { ok: false, error: `Deposit was not saved. ${TRUST_SAVE_FAILED}` }
      }
      addActivity(
        `Deposit held ${(row.heldCents / 100).toFixed(2)} ZAR for occupancy ${row.occupancyId}`,
        actor.name,
        row.agencyId,
      )
      return { ok: true, depositId: row.id }
    },
    [patch, addActivity, persistUpsert],
  )

  const proposeDepositReleaseAction = useCallback(
    async (params: { depositId: string; actorUserId: string }) => {
      const dep = stateRef.current.depositHoldings.find((d) => d.id === params.depositId)
      const actor = stateRef.current.users.find((u) => u.id === params.actorUserId)
      if (!dep || !actor) return { ok: false, error: 'Deposit or actor not found' }
      const now = new Date().toISOString()
      const result = proposeDepositRelease(dep, actor.id, now)
      if (result.ok === false) return { ok: false, error: result.error }
      let updated = result.value
      if (isApiEnabled) {
        // Dual control is enforced server-side; generic persist never moves status.
        const { postDepositTransition } = await import('../lib/api/trustDepositsApi')
        const res = await postDepositTransition(dep.id, 'propose-release')
        if (res.ok === false) return { ok: false, error: res.error }
        updated = { ...updated, ...res.deposit }
        patch((s) => ({
          ...s,
          depositHoldings: s.depositHoldings.map((d) => (d.id === updated.id ? updated : d)),
        }))
      } else {
        patch((s) => ({
          ...s,
          depositHoldings: s.depositHoldings.map((d) => (d.id === updated.id ? updated : d)),
        }))
        await persistUpsert('deposit_holding', updated.id, updated as unknown as Record<string, unknown>)
      }
      addActivity(
        `Deposit release proposed for occupancy ${updated.occupancyId}`,
        actor.name,
        updated.agencyId,
      )
      return { ok: true }
    },
    [patch, addActivity, persistUpsert],
  )

  const approveDepositReleaseAction = useCallback(
    async (params: { depositId: string; approverUserId: string }) => {
      const dep = stateRef.current.depositHoldings.find((d) => d.id === params.depositId)
      const approver = stateRef.current.users.find((u) => u.id === params.approverUserId)
      if (!dep || !approver) return { ok: false, error: 'Deposit or approver not found' }
      const now = new Date().toISOString()
      const result = approveDepositRelease(dep, approver.id, now)
      if (result.ok === false) return { ok: false, error: result.error }
      let updated = result.value
      if (isApiEnabled) {
        // Two-person rule is enforced server-side (approver ≠ proposer).
        const { postDepositTransition } = await import('../lib/api/trustDepositsApi')
        const res = await postDepositTransition(dep.id, 'approve-release')
        if (res.ok === false) return { ok: false, error: res.error }
        updated = { ...updated, ...res.deposit }
        patch((s) => ({
          ...s,
          depositHoldings: s.depositHoldings.map((d) => (d.id === updated.id ? updated : d)),
        }))
      } else {
        patch((s) => ({
          ...s,
          depositHoldings: s.depositHoldings.map((d) => (d.id === updated.id ? updated : d)),
        }))
        await persistUpsert('deposit_holding', updated.id, updated as unknown as Record<string, unknown>)
      }
      addActivity(
        `Deposit release approved for occupancy ${updated.occupancyId} by ${approver.name}`,
        approver.name,
        updated.agencyId,
      )
      return { ok: true }
    },
    [patch, addActivity, persistUpsert],
  )

  /** D2: reject / cancel / refund run only through the server routes. */
  const runDepositServerStep = useCallback(
    async (
      depositId: string,
      actorUserId: string,
      step: 'reject-release' | 'cancel-release' | 'refund',
      payload: Record<string, unknown>,
      activity: string,
    ) => {
      const dep = stateRef.current.depositHoldings.find((d) => d.id === depositId)
      const actor = stateRef.current.users.find((u) => u.id === actorUserId)
      if (!dep || !actor) return { ok: false, error: 'Deposit or actor not found' }
      if (!isApiEnabled) return { ok: false, error: DEPOSIT_NEEDS_SERVER_COPY }
      const { postDepositTransition } = await import('../lib/api/trustDepositsApi')
      const res = await postDepositTransition(dep.id, step, payload)
      if (res.ok === false) return { ok: false, error: res.error }
      patch((s) => ({
        ...s,
        depositHoldings: s.depositHoldings.map((d) =>
          d.id === dep.id ? ({ ...d, ...res.deposit } as DepositHolding) : d,
        ),
      }))
      addActivity(`${activity} for occupancy ${dep.occupancyId}`, actor.name, dep.agencyId)
      return { ok: true }
    },
    [patch, addActivity],
  )

  const rejectDepositReleaseAction = useCallback(
    async (p: { depositId: string; actorUserId: string; reason: string }) => {
      const reason = p.reason.trim()
      if (!reason || reason.length > 500) {
        return { ok: false, error: 'A reason of 1 to 500 characters is required' }
      }
      return runDepositServerStep(p.depositId, p.actorUserId, 'reject-release', { reason }, 'Deposit release rejected')
    },
    [runDepositServerStep],
  )

  const cancelDepositReleaseAction = useCallback(
    async (p: { depositId: string; actorUserId: string; reason?: string }) =>
      runDepositServerStep(
        p.depositId,
        p.actorUserId,
        'cancel-release',
        { reason: p.reason?.trim() ?? '' },
        'Deposit release cancelled',
      ),
    [runDepositServerStep],
  )

  const recordDepositRefundAction = useCallback(
    async (p: {
      depositId: string
      actorUserId: string
      refundedCents: number
      interestCents: number
      deductions: { reason: string; amountCents: number }[]
    }) => {
      const dep = stateRef.current.depositHoldings.find((d) => d.id === p.depositId)
      if (!dep) return { ok: false, error: 'Deposit not found' }
      const split = {
        refundedCents: p.refundedCents,
        interestCents: p.interestCents,
        deductions: p.deductions.map((d) => ({ reason: d.reason.trim(), amountCents: d.amountCents })),
      }
      const bad = checkRefundSplit(dep.heldCents, split)
      if (bad) return { ok: false, error: bad }
      return runDepositServerStep(p.depositId, p.actorUserId, 'refund', split, 'Refund recorded (not bank-confirmed)')
    },
    [runDepositServerStep],
  )

  const proposePayoutInstruction = useCallback(
    async (params: {
      agencyId: string
      actorUserId: string
      occupancyId?: string | null
      propertyId: string
      payeeType?: string
      payeeId: string
      bankAccountId?: string
      amountCents: number
      bucketCode?: string
      idempotencyKey?: string
    }) => {
      const actor = stateRef.current.users.find((u) => u.id === params.actorUserId)
      if (!actor) return { ok: false, error: 'Actor not found' }
      const now = new Date().toISOString()
      const instructionId = uid('pi')
      const built = buildProposedPayout({
        id: instructionId,
        agencyId: params.agencyId,
        occupancyId: params.occupancyId ?? null,
        propertyId: params.propertyId,
        payeeType: params.payeeType ?? 'landlord',
        payeeId: params.payeeId,
        bankAccountId: params.bankAccountId ?? '',
        amountCents: params.amountCents,
        bucketCode: params.bucketCode ?? 'owner_payable',
        proposedBy: actor.id,
        idempotencyKey: params.idempotencyKey ?? instructionId,
        now,
      })
      if (built.ok === false) return { ok: false, error: built.error }
      const row = built.value
      // CR9: await the save; a failed save removes the optimistic row and returns ok false.
      const committed = await commitProposedPayout({
        row,
        patch,
        persist: (r) => persistUpsert('payout_instruction', r.id, r as unknown as Record<string, unknown>),
      })
      if (committed.ok === false) return { ok: false, error: committed.error }
      addActivity(
        `Payout proposed (${(row.amountCents / 100).toFixed(2)} ZAR) — awaiting dual-control approval`,
        actor.name,
        row.agencyId,
      )
      return { ok: true, instructionId: row.id }
    },
    [patch, addActivity, persistUpsert],
  )

  const approvePayoutInstruction = useCallback(
    async (params: { instructionId: string; approverUserId: string }) => {
      const inst = stateRef.current.payoutInstructions.find((p) => p.id === params.instructionId)
      const approver = stateRef.current.users.find((u) => u.id === params.approverUserId)
      if (!inst || !approver) return { ok: false, error: 'Instruction or approver not found' }
      const now = new Date().toISOString()
      const result = applyApprovePayout(inst, approver.id, now)
      if (result.ok === false) return { ok: false, error: result.error }
      let updated = result.value
      if (isApiEnabled) {
        // Dual control is enforced server-side; never via generic persist.
        const { postPayoutTransition } = await import('../lib/api/trustPayoutsApi')
        const res = await postPayoutTransition(inst.id, 'approve')
        if (res.ok === false) return { ok: false, error: res.error }
        updated = { ...updated, ...res.instruction }
        patch((s) => ({
          ...s,
          payoutInstructions: s.payoutInstructions.map((p) => (p.id === inst.id ? updated : p)),
        }))
      } else {
        patch((s) => ({
          ...s,
          payoutInstructions: s.payoutInstructions.map((p) => (p.id === inst.id ? updated : p)),
        }))
      }
      addActivity(
        `Payout approved (${(inst.amountCents / 100).toFixed(2)} ZAR) by ${approver.name}`,
        approver.name,
        inst.agencyId,
      )
      return { ok: true }
    },
    [patch, addActivity, persistUpsert],
  )

  const submitPayoutInstruction = useCallback(
    async (params: { instructionId: string; actorUserId: string }) => {
      const inst = stateRef.current.payoutInstructions.find((p) => p.id === params.instructionId)
      const actor = stateRef.current.users.find((u) => u.id === params.actorUserId)
      if (!inst || !actor) return { ok: false, error: 'Instruction or actor not found' }
      const now = new Date().toISOString()
      const result = applySubmitPayout(inst, actor.id, now)
      if (result.ok === false) return { ok: false, error: result.error }
      let updated = result.value
      // Honesty: submitted ≠ settled; never invent partnerPayoutId.
      if (isApiEnabled) {
        const { postPayoutTransition } = await import('../lib/api/trustPayoutsApi')
        const res = await postPayoutTransition(inst.id, 'submit')
        if (res.ok === false) return { ok: false, error: res.error }
        updated = { ...updated, ...res.instruction }
        patch((s) => ({
          ...s,
          payoutInstructions: s.payoutInstructions.map((p) => (p.id === inst.id ? updated : p)),
        }))
      } else {
        patch((s) => ({
          ...s,
          payoutInstructions: s.payoutInstructions.map((p) => (p.id === inst.id ? updated : p)),
        }))
      }
      addActivity(
        `Payout submitted (in-app only — not settled) (${(inst.amountCents / 100).toFixed(2)} ZAR)`,
        actor.name,
        inst.agencyId,
      )
      return { ok: true }
    },
    [patch, addActivity, persistUpsert],
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
      // Someone else's notification goes through the server's checked route.
      if (n.userId && n.userId !== getApiActor()?.userId) dispatchNotificationsToServer([n])
      else queueUpsert('notification', n.id, n as unknown as Record<string, unknown>)
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
      recipientUserIds: string[]
    }) => {
      const includeActor = input.includeActor !== false
      const scopedIds = excludeActorFromIds(
        input.recipientUserIds,
        input.actorUserId,
        includeActor,
      )
      const s0 = stateRef.current
      const rule = resolveSuiteAlert(s0.suiteAlerts, input.agencyId, input.resource, input.action)
      if (!rule || !scopedIds.length) return
      const recipients = applySuiteAlertFilter(s0.users, scopedIds, rule, input.agencyId)
      if (!recipients.length) return

      const at = new Date().toISOString()
      const created: AppNotification[] = recipients.map((user) => ({
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
      }))
      const nextToasts: NotificationToast[] = rule.popupEnabled
        ? created.map((n) => ({
            id: uid('toast'),
            notificationId: n.id,
            userId: n.userId,
            title: n.title,
            body: n.body,
            link: n.link,
            durationMs: rule.popupDurationMs || DEFAULT_POPUP_DURATION_MS,
            createdAt: Date.now(),
            action: input.action,
            tone: toastToneForAction(input.action),
          }))
        : []

      setState((s) => ({ ...s, notifications: [...created, ...s.notifications].slice(0, 300) }))
      if (nextToasts.length) setToasts((prev) => [...nextToasts, ...prev].slice(0, 6))
      // Save on the server so each person sees it on their own device and gets the email.
      dispatchNotificationsToServer(created)
    },
    [],
  )

  const value = useMemo<StoreContextValue>(() => ({
    state,
    hydratedForUserId,
    hydrationFailed,
    resetForUserSwitch: () => {
      if (!LIVE_DATA_MODE) return // demo mode: as on main
      resetToDefault()
    },
    toasts,
    refreshBootstrap,
    refreshSessionData,
    refreshMarketplaceListings,
    resetDemo: () => {
      localStorage.removeItem(STORAGE_KEY)
      localStorage.removeItem(PG_HYDRATED_FLAG)
      setState(defaultState())
      setToasts([])
      const actor = resolveBootstrapActor(defaultState().users)
      if (!isApiEnabled) return
      void fetchBootstrapFromApi(false, actor).then((boot) => {
        if (!boot) {
          setTicketAccessNotesSupported(false)
          return
        }
        setTicketAccessNotesSupported(ticketAccessNotesSupportedFromBootstrap(boot))
        setState((prev) => applyPostgresBootstrap(prev, boot))
        localStorage.setItem(PG_HYDRATED_FLAG, 'postgres')
      })
    },
    createAgency: (input) => {
      const agency: Agency = {
        id: uid('ag'),
        status: input.status ?? 'Active',
        createdAt: new Date().toISOString().slice(0, 10),
        name: input.name,
        slug: input.slug,
        city: input.city,
        enabledPermissions: input.enabledPermissions?.length
          ? input.enabledPermissions
          : [...DEFAULT_AGENCY_PERMISSIONS],
        tradingAs: input.tradingAs,
        email: input.email,
        phone: input.phone,
        province: input.province,
        countryCode: input.countryCode,
        timezone: input.timezone,
      }
      const defaultAlerts = buildDefaultSuiteAlerts(agency.id)
      patch((s) => ({
        ...s,
        agencies: [...s.agencies, agency],
        suiteAlerts: [...s.suiteAlerts, ...defaultAlerts],
      }))
      addActivity(`Agency created: ${agency.name}`, 'Super Admin', null)
      persistUpsert('agency', agency.id, agency as unknown as Record<string, unknown>)
      for (const alert of defaultAlerts) {
        persistUpsert('suite_alert', alert.id, alert as unknown as Record<string, unknown>)
      }
      return agency
    },
    updateAgency: (id, p) => {
      patch((s) => ({ ...s, agencies: s.agencies.map((a) => (a.id === id ? { ...a, ...p } : a)) }))
      const next = { ...state.agencies.find((a) => a.id === id), ...p, id }
      persistUpsert('agency', id, next as Record<string, unknown>)
    },
    cancelAgency: async (id) => {
      const agency = stateRef.current.agencies.find((a) => a.id === id)
      if (!agency) return { ok: false, reason: 'Agency not found.' }
      if (agency.status === 'Cancelled') {
        return { ok: false, reason: 'This agency is already cancelled.' }
      }
      const next = { ...agency, status: 'Cancelled' as const }
      patch((s) => ({
        ...s,
        agencies: s.agencies.map((a) => (a.id === id ? next : a)),
      }))
      const result = await persistUpsertResult('agency', id, next as unknown as Record<string, unknown>)
      if (!result.ok) {
        patch((s) => ({
          ...s,
          agencies: s.agencies.map((a) => (a.id === id ? agency : a)),
        }))
        const { persistErrorMessage } = await import('../lib/api/persist')
        return {
          ok: false,
          reason: persistErrorMessage(result) ?? 'Could not cancel agency. Try again.',
        }
      }
      addActivity(`Agency cancelled: ${agency.name}`, 'Super Admin', null)
      return { ok: true }
    },
    createUser: (input) => {
      const { password, tempPassword, onTempPassword, ...rest } = input as typeof input & {
        password?: string
        tempPassword?: string
      }
      const user: AppUser = {
        ...rest,
        id: uid('u'),
        active: input.active ?? true,
        enabledPermissions:
          input.role === 'super_admin'
            ? undefined
            : input.enabledPermissions?.length
              ? input.enabledPermissions
              : undefined,
      }
      patch((s) => ({ ...s, users: [...s.users, user] }))
      // Fire-and-forget for legacy callers (e.g. landlord picker). Prefer
      // createUserDurable for SA staff mint so success UI cannot race Auth.
      if (!password && !tempPassword) {
        // No constant default (Jim B2): the server generates a random temp
        // password on this create and returns it once; hand it to the caller's
        // one-time modal (never stored).
        void (async () => {
          const { markLocalPersistWrite } = await import('../lib/bootstrapMerge')
          markLocalPersistWrite('user', user.id)
          const { persistUserCreateViaServer } = await import('../lib/api/persist')
          const res = await persistUserCreateViaServer({
            resource: 'user',
            action: 'upsert',
            id: user.id,
            data: { ...(user as unknown as Record<string, unknown>), id: user.id },
          })
          if (res.ok && res.tempPassword) onTempPassword?.(res.tempPassword)
        })()
        return user
      }
      persistUpsert('user', user.id, {
        ...(user as unknown as Record<string, unknown>),
        ...(password ? { password } : {}),
        ...(tempPassword ? { tempPassword } : {}),
      })
      return user
    },
    createUserDurable: async (input) => {
      const { password, tempPassword, ...rest } = input as typeof input & {
        password?: string
        tempPassword?: string
      }
      const plain =
        (typeof tempPassword === 'string' && tempPassword.trim()) ||
        (typeof password === 'string' && password.trim()) ||
        ''
      const user: AppUser = {
        ...rest,
        id: uid('u'),
        active: input.active ?? true,
        enabledPermissions:
          input.role === 'super_admin'
            ? undefined
            : input.enabledPermissions?.length
              ? input.enabledPermissions
              : undefined,
      }
      patch((s) => ({ ...s, users: [...s.users, user] }))
      // Always the server path: it generates the temp password when none was
      // typed.
      const { markLocalPersistWrite } = await import('../lib/bootstrapMerge')
      markLocalPersistWrite('user', user.id)
      const { persistUserCreateViaServer } = await import('../lib/api/persist')
      const res = await persistUserCreateViaServer({
        resource: 'user',
        action: 'upsert',
        id: user.id,
        data: { ...(user as unknown as Record<string, unknown>), id: user.id, ...(plain ? { tempPassword: plain } : {}) },
      })
      if (!res.ok) {
        patch((s) => ({ ...s, users: s.users.filter((u) => u.id !== user.id) }))
        const serverError = res.ok === false ? res.error : undefined
        return {
          ok: false as const,
          error:
            serverError ||
            'Could not create this user. Check the email is unused and try again.',
          user,
        }
      }
      scheduleBootstrapRefreshAfterMutation()
      return res.ok && res.tempPassword
        ? { ok: true as const, user, generatedTempPassword: res.tempPassword }
        : { ok: true as const, user }
    },
    updateUser: (id, p) => {
      patch((s) => ({ ...s, users: s.users.map((u) => (u.id === id ? { ...u, ...p } : u)) }))
      const next = { ...state.users.find((u) => u.id === id), ...p, id }
      persistUpsert('user', id, next as Record<string, unknown>)
    },
    saveMySignature: async (userId, signature) => {
      const before = stateRef.current.users.find((u) => u.id === userId)
      if (!before) return false
      const prev = before.signature ?? null
      patch((s) => ({ ...s, users: s.users.map((u) => (u.id === userId ? { ...u, signature } : u)) }))
      const ok = await persistUpsert('user', userId, { ...before, signature, id: userId } as Record<string, unknown>)
      if (ok === false) {
        patch((s) => ({ ...s, users: s.users.map((u) => (u.id === userId ? { ...u, signature: prev } : u)) }))
        return false
      }
      return true
    },
    updateTenancy: (id, p) => {
      patch((s) => ({
        ...s,
        tenancies: s.tenancies.map((t) => (t.id === id ? { ...t, ...p } : t)),
      }))
      const next = { ...state.tenancies.find((t) => t.id === id), ...p, id }
      persistUpsert('tenancy', id, next as Record<string, unknown>)
    },
    issueLeasePackage: async (tenancyId, actor) => {
      const lease = stateRef.current.tenancies.find((t) => t.id === tenancyId)
      if (!lease) return { ok: false, error: 'Tenancy not found' }
      const next = await issueLeasePackageForTenancy(lease, {
        userId: actor?.userId,
        name: actor?.name,
      })
      if (!next.leaseDocumentId && !next.eSign) {
        return { ok: false, error: 'Lease package could not be issued' }
      }
      return { ok: true }
    },
    recordTenancyLeaseSign: async ({
      tenancyId,
      party,
      signerName,
      signatureDataUrl,
      method,
      onBehalfConfirmation,
      ectaConsent,
      actorUserId,
    }) => {
      const lease = stateRef.current.tenancies.find((t) => t.id === tenancyId)
      if (!lease) return { ok: false, error: 'Tenancy not found' }
      let eSign = lease.eSign
      if (!eSign?.envelopeId) {
        const issued = await issueLeasePackageForTenancy(lease, {
          userId: actorUserId,
          name: signerName,
        })
        eSign = issued.eSign ?? null
      }
      if (!eSign) return { ok: false, error: 'No e-sign envelope on this lease' }
      // Ask SigniFlow for status only once the envelope is saved on the lease:
      // the server's status route refuses an envelope the stored lease lacks.
      const eSignSave = leaseESignSaves.current.get(tenancyId)
      if (eSignSave) {
        const ok = await eSignSave
        leaseESignSaves.current.delete(tenancyId)
        if (!ok) {
          return {
            ok: false,
            error: "The e-sign envelope wasn't saved on this lease, so the signature can't be checked yet. Refresh and try again.",
          }
        }
      }
      const signed = await recordLeaseSignature({
        eSign,
        tenancyId,
        party,
        signerName,
        signatureDataUrl: await sendableSignature(signatureDataUrl),
        method,
        onBehalfConfirmation,
        ectaConsent,
        actorUserId,
      })
      if (!signed.ok) return { ok: false, error: signed.error }
      // Refresh from state in case issueLeasePackageForTenancy updated docs
      const fresh = stateRef.current.tenancies.find((t) => t.id === tenancyId) ?? lease
      const merged: Tenancy = { ...fresh, eSign: signed.eSign }
      patch((s) => ({
        ...s,
        tenancies: s.tenancies.map((t) => (t.id === tenancyId ? merged : t)),
      }))
      const leaseSaved = persistUpsert('tenancy', tenancyId, merged as unknown as Record<string, unknown>)
      // CR10: the server sign function decides; a refused signing (403
      // SIGNATURE_NOT_SIGNER / NOT_OWN / unconfirmed, 400 SIGNATURE_INVALID)
      // restores the lease as it was and reports the failure.
      if ((await leaseSaved) === false) {
        patch((s) => ({
          ...s,
          tenancies: s.tenancies.map((t) => (t.id === tenancyId && t.eSign === signed.eSign ? fresh : t)),
        }))
        return { ok: false, error: 'The signature was not saved. Refresh and try again.' }
      }
      // Mirror workflow when linked application exists. The server accepts the
      // mirror only for the status the stored lease envelope shows, so the
      // application write waits for the lease write; stage / progress are
      // derived from the new status (normalizeApplication), not left stale.
      const derived = workflowStatusFromESign(signed.eSign)
      if (derived && fresh.applicationId) {
        const app = stateRef.current.applications.find((a) => a.id === fresh.applicationId)
        if (app) {
          const updated = normalizeApplication({
            ...app,
            workflowStatus: derived,
          })
          patch((s) => ({
            ...s,
            applications: s.applications.map((a) => (a.id === app.id ? updated : a)),
          }))
          if (await leaseSaved) {
            await persistApplicationOrRollback(app.id, updated, app)
          }
        }
      }
      return { ok: true }
    },
    assignRole: (userId, role, agencyId) => {
      patch((s) => ({
        ...s,
        users: s.users.map((u) => {
          if (u.id !== userId) return u
          const roleChanged = u.role !== role
          const nextAgencyId =
            role === 'super_admin' ? null : agencyId === undefined ? u.agencyId : agencyId
          return {
            ...u,
            role,
            agencyId: nextAgencyId,
            enabledPermissions:
              role === 'super_admin' ? undefined : roleChanged ? undefined : u.enabledPermissions,
            licenseStatus: roleChanged ? defaultLicenseStatus(role) : u.licenseStatus,
            mentorId: roleChanged
              ? role === 'agent'
                ? u.mentorId
                : null
              : u.mentorId,
            commissionSharePct: roleChanged
              ? role === 'ground_agent' || role === 'agent'
                ? u.commissionSharePct ?? (role === 'ground_agent' ? 70 : 50)
                : undefined
              : u.commissionSharePct,
          }
        }),
      }))
      const u = state.users.find((x) => x.id === userId)
      if (u) {
        const roleChanged = u.role !== role
        const nextAgencyId =
          role === 'super_admin' ? null : agencyId === undefined ? u.agencyId : agencyId
        persistUpsert('user', userId, {
          ...u,
          role,
          agencyId: nextAgencyId,
          enabledPermissions:
            role === 'super_admin' ? undefined : roleChanged ? undefined : u.enabledPermissions,
          licenseStatus: roleChanged ? defaultLicenseStatus(role) : u.licenseStatus,
        } as unknown as Record<string, unknown>)
      }
    },
    createLookup: (input) => {
      const clientId = input.clientId || GLOBAL_CLIENT_ID
      let created: LookupConfig | null = null
      patch((s) => {
        const siblings = s.lookups.filter((l) => l.clientId === clientId && l.configType === input.configType)
        if (siblings.some((l) => l.keyValue === input.keyValue)) return s
        const sortOrder = input.sortOrder ?? (siblings.reduce((m, l) => Math.max(m, l.sortOrder), -1) + 1)
        created = {
          id: uid('lk'),
          clientId,
          configType: input.configType,
          keyValue: input.keyValue,
          displayLabel: input.displayLabel,
          isActive: input.isActive ?? true,
          sortOrder,
          ...(input.meta ? { meta: input.meta } : {}),
        }
        return { ...s, lookups: [...s.lookups, created] }
      })
      if (!created) {
        throw new Error('Lookup key already exists for this client and type')
      }
      persistUpsert('lookup', created.id, created as unknown as Record<string, unknown>)
      return created
    },
    updateLookup: (id, p, forAgencyId) => {
      const target = state.lookups.find((l) => l.id === id)
      if (!target) return
      if (p.isActive === false && isRequiredLookupKey(target.configType, target.keyValue)) return
      const next = writeLookupRows([target], () => p, forAgencyId)[0]
      if (next) persistUpsert('lookup', next.id, next as unknown as Record<string, unknown>)
    },
    reorderLookups: (clientId, configType, orderedIds, forAgencyId) => {
      const rows = orderedIds
        .map((id) => state.lookups.find((l) => l.id === id))
        .filter(
          (l): l is LookupConfig =>
            Boolean(l) && l!.configType === configType && (Boolean(forAgencyId) || l!.clientId === clientId),
        )
      const saved = writeLookupRows(rows, (row) => ({ sortOrder: orderedIds.indexOf(row.id) }), forAgencyId)
      for (const row of saved) {
        persistUpsert('lookup', row.id, row as unknown as Record<string, unknown>)
      }
    },
    deactivateLookup: (id, forAgencyId) => {
      const target = state.lookups.find((l) => l.id === id)
      if (!target || isRequiredLookupKey(target.configType, target.keyValue)) return false
      const next = writeLookupRows([target], () => ({ isActive: false }), forAgencyId)[0]
      if (!next) return false
      persistUpsert('lookup', next.id, next as unknown as Record<string, unknown>)
      return true
    },
    broadcastNotification: (input) => {
      const broadcastId = uid('nb')
      const at = new Date().toISOString()
      const creator = state.users.find((u) => u.id === input.createdByUserId)
      const creatorIsPlatform = Boolean(
        creator &&
          userBasePermissions(creator.role, creator.enabledPermissions).includes('platform.manage'),
      )

      const deniedBroadcast = (): NotificationBroadcast => ({
        id: broadcastId,
        title: input.title,
        body: input.body,
        link: input.link,
        audience: input.audience,
        agencyId: input.agencyId ?? null,
        userId: input.userId ?? null,
        createdByUserId: input.createdByUserId,
        createdAt: at,
        recipientCount: 0,
      })

      if (!creatorIsPlatform) {
        if (input.audience === 'everyone') return deniedBroadcast()
        if (input.audience === 'agency') {
          if (!input.agencyId || input.agencyId !== creator?.agencyId) return deniedBroadcast()
        }
        if (input.audience === 'person') {
          const target = state.users.find((u) => u.id === input.userId)
          if (!target || !creator?.agencyId || target.agencyId !== creator.agencyId) {
            return deniedBroadcast()
          }
        }
      }

      let recipients: AppUser[] = []
      if (input.audience === 'everyone') {
        recipients = state.users.filter((u) => u.active)
      } else if (input.audience === 'agency' && input.agencyId) {
        recipients = state.users.filter(
          (u) => u.active && u.agencyId === input.agencyId && isAgencyStaff(u.role),
        )
      } else if (input.audience === 'person' && input.userId) {
        recipients = state.users.filter((u) => u.id === input.userId)
      }
      const notes: AppNotification[] = recipients.map((u) => ({
        id: uid('n'),
        userId: u.id,
        agencyId: u.agencyId,
        title: input.title,
        body: input.body,
        at,
        read: false,
        link: input.link,
        broadcastId,
      }))
      const broadcast: NotificationBroadcast = {
        id: broadcastId,
        title: input.title,
        body: input.body,
        link: input.link,
        audience: input.audience,
        agencyId: input.agencyId ?? null,
        userId: input.userId ?? null,
        createdByUserId: input.createdByUserId,
        createdAt: at,
        recipientCount: notes.length,
      }
      patch((s) => ({
        ...s,
        notifications: [...notes, ...s.notifications].slice(0, 500),
        notificationBroadcasts: [broadcast, ...s.notificationBroadcasts].slice(0, 100),
      }))
      addActivity(
        `Broadcast: ${input.title} → ${input.audience} (${notes.length})`,
        'Admin',
        input.agencyId ?? null,
      )
      return broadcast
    },
    createProperty: (input) => {
      // P0-4: Use unt- prefix as canonical public ID for single durable public face
      // P0-collision (R10): mint against the live property set so a new listing
      // can never resolve to an existing listing's public route.
      const propertyId = nextUniquePropertyId(
        stateRef.current.properties.map((p) => p.id),
        () => uid('unt'),
      )
      const property: PropertyAsset = {
        ...input,
        id: propertyId,
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
        recipientUserIds: propertyDeskStakeholderIds(state.users, property),
      })
      persistUpsert('property', property.id, property as unknown as Record<string, unknown>)
      return property
    },
    createPropertyBundle: async (input) => {
      const template =
        input.unitTemplateId && input.unitTemplateId !== 'custom'
          ? UNIT_TEMPLATES.find((t) => t.id === input.unitTemplateId)
          : undefined

      const existingBuilding = input.existingBuildingId
        ? state.buildings.find((b) => b.id === input.existingBuildingId)
        : undefined

      if (!existingBuilding && !input.building) {
        throw new Error('createPropertyBundle requires building or existingBuildingId')
      }

      const building: Building = existingBuilding ?? {
        ...(input.building as Omit<Building, 'id' | 'createdAt' | 'images'>),
        id: input.ids?.buildingId ?? uid('bld'),
        images: input.building?.images?.length ? input.building.images : [],
        createdAt: new Date().toISOString().slice(0, 10),
      }

      // P0-4: Ensure single durable public ID - property.id is canonical, unit.id is derived
      const propertyId = input.ids?.propertyId
        ? input.ids.propertyId
        : nextUniquePropertyId(stateRef.current.properties.map((p) => p.id), () => uid('unt'))
      const unitId = propertyId // Unit ID matches property ID for single public face
      const clientId = building.clientId

      const roomDrafts =
        input.rooms.length > 0
          ? input.rooms
          : (template?.rooms ?? []).map((r) => ({ ...r }))

      const roomTotals = summarizeRooms(
        roomDrafts.map((r) => ({ kind: r.kind, beds: r.beds, baths: r.baths })),
      )

      // P0-5: persist a resolvable agentId on both unit + property (FA book /
      // Unassigned). Prefer unit.agentId, then property.agentId — never invent.
      const resolvedAgentId = input.unit.agentId || input.property.agentId || null

      const unit: Unit = {
        id: unitId,
        clientId,
        buildingId: building.id,
        agentId: resolvedAgentId,
        unitNumber: input.unit.unitNumber,
        title: input.unit.title,
        squareMeters: input.unit.squareMeters ?? template?.squareMeters ?? 0,
        bedrooms: input.unit.bedrooms ?? roomTotals.bedrooms,
        bathrooms: input.unit.bathrooms ?? roomTotals.bathrooms,
        parking: input.unit.parking ?? template?.parking ?? 0,
        listingType: input.unit.listingType,
        price: input.unit.price,
        rent: input.unit.rent,
        statusKey: 'DRAFT',
        description: input.unit.description ?? template?.blurb ?? '',
        amenities: input.unit.amenities?.length ? input.unit.amenities : ['Fibre'],
        images: input.property.images?.length ? input.property.images : building.images,
        featured: false,
        lat: building.lat,
        lng: building.lng,
        createdAt: new Date().toISOString().slice(0, 10),
      }

      const infraRooms: InfraRoom[] = roomDrafts.map((r, i) => ({
        id: input.ids?.roomIds?.[i] ?? uid('rm'),
        clientId,
        unitId,
        name: r.name,
        kind: r.kind,
        beds: r.beds,
        baths: r.baths,
        areaSqm: r.areaSqm,
        layout:
          r.layout ??
          ({
            x: 5 + (i % 2) * 48,
            y: 5 + Math.floor(i / 2) * 32,
            w: 42,
            h: 28,
          } as InfraRoom['layout']),
      }))

      const beds = roomTotals.bedrooms
      const baths = roomTotals.bathrooms
      const propertyRooms: Room[] = infraRooms.map((r) => ({
        id: r.id,
        name: r.name,
        beds: r.beds,
        baths: r.baths,
        area: r.areaSqm,
        kind: r.kind,
        layout: r.layout,
      }))

      const starterSource =
        input.starterAssets ??
        (template?.starterAssets ?? []).map((a) => ({
          roomName: a.roomName,
          itemName: a.itemName,
          assetTypeKey: a.assetTypeKey,
          brand: a.brand,
          condition: a.condition,
        }))

      const assets: InternalAsset[] = starterSource.map((a) => {
        const room = infraRooms.find((r) => r.name === a.roomName)
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

      const property: PropertyAsset = {
        ...input.property,
        id: propertyId, // P0-4: Use same ID as unit for single durable public ID
        buildingId: building.id,
        unitId,
        agentId: resolvedAgentId,
        beds,
        baths,
        garages: roomTotals.garages,
        createdAt: new Date().toISOString().slice(0, 10),
        images: input.property.images?.length ? input.property.images : [],
        rooms: input.property.rooms?.length ? input.property.rooms : propertyRooms,
      }

      const unitPersistBase = {
        ...unit,
        agencyId: property.agencyId,
        landlordId: property.landlordId,
        unitNumber: input.unit.unitNumber,
        buildingId: building.id,
        type: property.type,
        listingMode: property.listingMode,
        status: property.status,
        beds: property.beds,
        baths: property.baths,
        area: property.area,
        images: property.images,
        ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
      } as Record<string, unknown>

      const { persistErrorMessage } = await import('../lib/api/persist')

      const throwPersistFailure = (label: string, message?: string) => {
        throw new Error(message || `Could not save the ${label}. Try again.`)
      }

      // P0-5: durable writes before local state — no phantom wizard rows on failure.
      if (!existingBuilding) {
        const buildingResult = await persistUpsertResult(
          'building',
          building.id,
          building as unknown as Record<string, unknown>,
        )
        if (!buildingResult.ok) {
          throwPersistFailure('building', persistErrorMessage(buildingResult))
        }
      }

      let unitPersistData = { ...unitPersistBase, agentId: unit.agentId }
      let unitResult = await persistUpsertResult('unit', unit.id, unitPersistData)
      const unitErr = persistErrorMessage(unitResult)
      if (
        !unitResult.ok &&
        unit.agentId &&
        (unitErr?.includes('agent not resolved') || unitErr?.toLowerCase().includes('agent'))
      ) {
        // Save the listing without the agent, but tell the wizard why (it used
        // to drop the agent silently, so "assigned" listings showed Unassigned).
        unitPersistData = { ...unitPersistBase, agentId: null }
        unitResult = await persistUpsertResult('unit', unit.id, unitPersistData)
        if (unitResult.ok) {
          unit.agentId = null
          property.agentId = null
          ;(property as PropertyAsset & { agentAssignError?: string }).agentAssignError =
            unitErr ?? 'The agent could not be assigned.'
        }
      }
      if (!unitResult.ok) {
        throwPersistFailure('unit', persistErrorMessage(unitResult))
      }
      if (unitResult.ok && unitResult.uuid) {
        unit.backendId = unitResult.uuid
        property.backendId = unitResult.uuid
      }

      const propertyResult = await persistUpsertResult('property', property.id, {
        ...property,
        unitNumber: input.unit.unitNumber,
      } as unknown as Record<string, unknown>)
      if (!propertyResult.ok) {
        throw new CreatePropertyBundleError(
          propertyId,
          persistErrorMessage(propertyResult) ?? 'Could not save the property. Try again.',
        )
      }
      if (propertyResult.ok && propertyResult.uuid) {
        property.backendId = propertyResult.uuid
      }

      patch((s) => ({
        ...s,
        buildings: existingBuilding ? s.buildings : [building, ...s.buildings],
        units: [unit, ...s.units],
        infraRooms: [...infraRooms, ...s.infraRooms],
        internalAssets: [...assets, ...s.internalAssets],
        properties: [property, ...s.properties],
      }))

      addActivity(`Asset created: ${property.title}`, 'Agent', property.agencyId)
      emitSuiteEvent({
        agencyId: property.agencyId,
        resource: 'property',
        action: 'created',
        title: 'Property created',
        body: `“${property.title}” was added to the portfolio.`,
        link: `/workspace/properties/${property.id}`,
        recipientUserIds: propertyDeskStakeholderIds(state.users, property),
      })

      for (const room of infraRooms) {
        const roomResult = await persistUpsertResult(
          'room',
          room.id,
          room as unknown as Record<string, unknown>,
        )
        if (!roomResult.ok) {
          throw new CreatePropertyBundleError(
            propertyId,
            persistErrorMessage(roomResult) ?? 'Could not save a room. Try again.',
          )
        }
      }

      return property
    },
    updateProperty: (id, p) => {
      const prev = stateRef.current.properties.find((x) => x.id === id)
      let pe: PropertyEvent | null = null
      let unitPatch: Unit | null = null
      if (prev && p.status != null) {
        const targetUnitId = prev.unitId === prev.id ? prev.id : prev.unitId
        const unit = targetUnitId
          ? stateRef.current.units.find((u) => u.id === targetUnitId)
          : undefined
        unitPatch = computeUnitPatchForPropertyStatus({ ...prev, ...p }, unit, p.status)
      }
      patch((s) => {
        const current = s.properties.find((x) => x.id === id)
        const properties = s.properties.map((x) => (x.id === id ? { ...x, ...p } : x))
        if (!current) {
          return {
            ...s,
            properties,
            units: unitPatch
              ? s.units.map((u) => (u.id === unitPatch!.id ? unitPatch! : u))
              : s.units,
          }
        }
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
        if (p.agentId !== undefined && p.agentId !== current.agentId) {
          const fromName =
            s.users.find((u) => u.id === current.agentId)?.name ?? (current.agentId ? 'Assigned' : 'Unassigned')
          const toName =
            s.users.find((u) => u.id === p.agentId)?.name ?? (p.agentId ? 'Assigned' : 'Unassigned')
          changes.push({ field: 'Agent', from: fromName, to: toName })
        }
        if (!changes.length) {
          return {
            ...s,
            properties,
            units: unitPatch
              ? s.units.map((u) => (u.id === unitPatch!.id ? unitPatch! : u))
              : s.units,
          }
        }
        pe = {
          id: uid('pe'),
          agencyId: current.agencyId,
          propertyId: id,
          actorUserId: null,
          actorName: 'System',
          action: changes.length === 1 ? `changed the ${changes[0].field}` : 'updated the Property',
          at: new Date().toISOString(),
          changes,
        }
        return {
          ...s,
          properties,
          units: unitPatch
            ? s.units.map((u) => (u.id === unitPatch!.id ? unitPatch! : u))
            : s.units,
          propertyEvents: [pe, ...s.propertyEvents].slice(0, 400),
        }
      })
      if (prev) {
        emitSuiteEvent({
          agencyId: prev.agencyId,
          resource: 'property',
          action: 'updated',
          title: 'Property updated',
          body: `“${p.title ?? prev.title}” was changed.`,
          link: `/workspace/properties/${id}`,
          recipientUserIds: propertyDeskStakeholderIds(state.users, { ...prev, ...p }),
        })
      }
      if (prev) {
        persistUpsert('property', id, { ...prev, ...p, id } as Record<string, unknown>)
      }
      if (unitPatch) {
        persistUpsert('unit', unitPatch.id, unitPatch as unknown as Record<string, unknown>)
      }
      if (pe) persistUpsert('property_event', pe.id, pe as unknown as Record<string, unknown>)
      scheduleBootstrapRefreshAfterMutation()
    },
    assignPropertyAgent: async (id, agentId) => {
      const prev = stateRef.current.properties.find((x) => x.id === id)
      if (!prev) return { ok: false, reason: 'Property not found. Refresh and try again.' }
      const before = prev.agentId ?? null
      const next = agentId || null
      if (before === next) return { ok: true }
      const unitId = prev.unitId
      const apply = (value: string | null) =>
        patch((s) => ({
          ...s,
          properties: s.properties.map((x) => (x.id === id ? { ...x, agentId: value } : x)),
          units: s.units.map((u) => (u.id === unitId ? { ...u, agentId: value } : u)),
        }))
      apply(next)
      const result = await persistUpsertResult('property', id, { ...prev, agentId: next, id } as Record<string, unknown>)
      if (!result.ok) {
        apply(before)
        const { persistErrorMessage } = await import('../lib/api/persist')
        return { ok: false, reason: persistErrorMessage(result) ?? 'The agent could not be assigned.' }
      }
      const s = stateRef.current
      const fromName = s.users.find((u) => u.id === before)?.name ?? (before ? 'Assigned' : 'Unassigned')
      const toName = s.users.find((u) => u.id === next)?.name ?? (next ? 'Assigned' : 'Unassigned')
      const pe: PropertyEvent = {
        id: uid('pe'),
        agencyId: prev.agencyId,
        propertyId: id,
        actorUserId: null,
        actorName: 'System',
        action: 'changed the Agent',
        at: new Date().toISOString(),
        changes: [{ field: 'Agent', from: fromName, to: toName }],
      }
      patch((st) => ({ ...st, propertyEvents: [pe, ...st.propertyEvents].slice(0, 400) }))
      persistUpsert('property_event', pe.id, pe as unknown as Record<string, unknown>)
      scheduleBootstrapRefreshAfterMutation()
      return { ok: true }
    },
    setPropertyRooms: (id, rooms) => {
      const beds = rooms.reduce((n, r) => n + r.beds, 0)
      const baths = rooms.reduce((n, r) => n + r.baths, 0)
      const prev = stateRef.current.properties.find((x) => x.id === id)
      if (!prev) return
      const unitId = prev.unitId
      const unit = stateRef.current.units.find((u) => u.id === unitId)
      const clientId = unit?.clientId ?? prev.agencyId
      const infraForUnit = roomsToInfraRooms(rooms, unitId, clientId)
      patch((s) => ({
        ...s,
        properties: s.properties.map((x) => (x.id === id ? { ...x, rooms, beds, baths } : x)),
        infraRooms: [...s.infraRooms.filter((r) => r.unitId !== unitId), ...infraForUnit],
        units: unit
          ? s.units.map((u) =>
              u.id === unitId ? { ...u, bedrooms: beds, bathrooms: baths } : u,
            )
          : s.units,
      }))
      persistUpsert('property', id, { ...prev, rooms, beds, baths } as unknown as Record<string, unknown>)
      if (unit) {
        persistUpsert('unit', unit.id, {
          ...unit,
          bedrooms: beds,
          bathrooms: baths,
        } as unknown as Record<string, unknown>)
      }
      for (const room of infraForUnit) {
        persistUpsert('room', room.id, room as unknown as Record<string, unknown>)
      }
      scheduleBootstrapRefreshAfterMutation()
    },
    publishProperty: async (id, status = 'Published', created?: PropertyAsset) => {
      let pe: PropertyEvent | null = null
      // P0-publish: read the freshest committed state, not the render-closure
      // snapshot. The wizard calls create → publish in the same tick, so `state`
      // here predates the new property and `prev` was undefined — the property
      // persist was skipped and the unit patch dereferenced a null object
      // (TypeError), while the UI still navigated away as if published.
      // P0-publish (R7): setState from createPropertyBundle has not re-rendered
      // when the wizard calls publish in the same tick — stateRef.current still
      // lacks the new property and publish returned false (listing stayed
      // Draft). The wizard passes the created snapshot so publish can resolve
      // it immediately.
      const prev =
        stateRef.current.properties.find((x) => x.id === id) ??
        (created && created.id === id ? created : undefined)
      // P0-publish: unknown id must be a no-op result, never a crash.
      if (!prev) return false
      // P0-1: the public gate reads both the property status AND the linked
      // unit's statusKey — publishing must index both or the listing stays
      // invisible on /browse and /listing/{id}.
      // P0-4: Ensure atomic publish to prevent race conditions and dual IDs
      const PUBLIC_ON: PropertyAsset['status'][] = ['Published', 'Featured', 'Under Offer']
      const targetUnitId = prev?.unitId === prev?.id ? prev.id : prev?.unitId
      const unit = targetUnitId
        ? stateRef.current.units.find((u) => u.id === targetUnitId)
        : undefined
      const unitPatch = computeUnitPatchForPropertyStatus(prev, unit, status)
      const nextUnitStatus = unitPatch?.statusKey ?? 'DRAFT'
      const unitListingType = unitPatch?.listingType ?? unit?.listingType ?? 'rent'
      patch((s) => {
        const current = s.properties.find((x) => x.id === id)
        if (!current || current.status === status) {
          return {
            ...s,
            properties: s.properties.map((x) => (x.id === id ? { ...x, status } : x)),
            units: unitPatch
              ? s.units.map((u) => (u.id === unitPatch!.id ? unitPatch! : u))
              : s.units,
          }
        }
        pe = {
          id: uid('pe'),
          agencyId: current.agencyId,
          propertyId: id,
          actorUserId: null,
          actorName: 'System',
          action: 'changed the Status',
          at: new Date().toISOString(),
          changes: [{ field: 'Status', from: current.status, to: status }],
        }
        return {
          ...s,
          properties: s.properties.map((x) => (x.id === id ? { ...x, status } : x)),
          units: unitPatch
            ? s.units.map((u) => (u.id === unitPatch!.id ? unitPatch! : u))
            : s.units,
          propertyEvents: [pe!, ...s.propertyEvents].slice(0, 400),
        }
      })
      // P0-5: await property + unit status writes; fail closed before "live".
      if (prev) {
        const propertyOk = await persistUpsert(
          'property',
          id,
          { ...prev, status, id } as Record<string, unknown>,
        )
        if (!propertyOk) return false
      }
      if (unitPatch) {
        const unitOk = await persistUpsert(
          'unit',
          unitPatch.id,
          unitPatch as unknown as Record<string, unknown>,
        )
        if (!unitOk) return false
      } else if (prev && targetUnitId && PUBLIC_ON.includes(status)) {
        // Same-tick create may leave unit out of stateRef; still stamp unit status.
        const fallbackUnit = stateRef.current.units.find((u) => u.id === targetUnitId)
        const unitPayload = fallbackUnit
          ? { ...fallbackUnit, statusKey: nextUnitStatus, listingType: unitListingType }
          : {
              id: targetUnitId,
              buildingId: prev.buildingId,
              clientId: prev.agencyId,
              agencyId: prev.agencyId,
              agentId: prev.agentId,
              unitNumber: prev.id.replace(/^unt-/, '') || 'MAIN',
              title: prev.title,
              statusKey: nextUnitStatus,
              listingType: unitListingType,
              price: prev.price,
              rent: prev.rent,
              squareMeters: prev.area,
              bedrooms: prev.beds,
              bathrooms: prev.baths,
              parking: prev.parking,
              description: prev.description,
              amenities: prev.amenities,
              images: prev.images,
              featured: prev.featured,
            }
        const unitOk = await persistUpsert(
          'unit',
          targetUnitId,
          unitPayload as unknown as Record<string, unknown>,
        )
        if (!unitOk) return false
      }
      if (pe) void persistUpsert('property_event', pe.id, pe as unknown as Record<string, unknown>)
      if (prev && PUBLIC_ON.includes(status)) {
        const hasOpenSlot = stateRef.current.viewingSlots.some(
          (s) => s.propertyId === id && s.status === 'Open',
        )
        if (!hasOpenSlot) {
          // P0-agent: only a real assigned agent — never invent a person.
          const agentId = prev.agentId ?? ''
          const start = new Date()
          start.setDate(start.getDate() + 2)
          start.setHours(10, 0, 0, 0)
          const slotDate = start.toISOString().slice(0, 10)
          for (const time of ['10:00', '14:00'] as const) {
            const slot: ViewingSlot = {
              id: uid('VS'),
              agencyId: prev.agencyId,
              propertyId: id,
              agentId,
              date: slotDate,
              time,
              capacity: 3,
              booked: 0,
              status: 'Open',
              title: 'Open viewing',
            }
            patch((s) => ({ ...s, viewingSlots: [slot, ...s.viewingSlots] }))
            persistUpsert('viewing_slot', slot.id, slot as unknown as Record<string, unknown>)
          }
        }
      }
      scheduleBootstrapRefreshAfterMutation()
      if (prev && PUBLIC_ON.includes(status)) {
        void refreshPublicMarketplaceInState()
      }
      // P0-publish: the wizard's primary Publish now knows whether the listing
      // actually flipped to a public state.
      return Boolean(prev && PUBLIC_ON.includes(status))
    },
    deleteProperty: async (id) => {
      const property = stateRef.current.properties.find((x) => x.id === id)
      if (!property) return { ok: false, reason: 'Property not found.' }

      const viewerUserId = readStoredAuthUserId() ?? getApiActor()?.userId ?? null
      const actorUser = stateRef.current.users.find((u) => u.id === viewerUserId)
      if (
        !actorUser ||
        !canDeleteStoredProperty(
          { role: actorUser.role, userId: actorUser.id, agencyId: actorUser.agencyId },
          property,
        )
      ) {
        return { ok: false, reason: 'You do not have permission to delete this property.' }
      }

      const blockReason = getPropertyDeleteBlockReason(
        property,
        stateRef.current.tenancies,
        stateRef.current.applications,
      )
      if (blockReason) return { ok: false, reason: blockReason }

      const prevUnit = property.unitId
        ? stateRef.current.units.find((u) => u.id === property.unitId)
        : undefined

      const deletedAt = new Date().toISOString()
      const pe: PropertyEvent = {
        id: uid('pe'),
        agencyId: property.agencyId,
        propertyId: id,
        actorUserId: null,
        actorName: 'System',
        action: 'removed the Property',
        at: deletedAt,
        changes: [{ field: 'Status', from: property.status, to: 'Deleted' }],
      }

      patch((s) => ({
        ...s,
        properties: s.properties.map((x) =>
          x.id === id
            ? { ...x, deletedAt, status: 'Archived', featured: false }
            : x,
        ),
        propertyEvents: [pe, ...s.propertyEvents].slice(0, 400),
        units: property.unitId
          ? s.units.map((u) =>
              u.id === property.unitId ? { ...u, statusKey: 'DELETED' } : u,
            )
          : s.units,
      }))

      const { persistErrorMessage } = await import('../lib/api/persist')
      const { markLocalPersistWrite } = await import('../lib/bootstrapMerge')
      if (property.unitId) {
        markLocalPersistWrite('unit', property.unitId)
      }

      const propertyResult = await persistUpsertResult('property', id, {
        ...property,
        deletedAt,
        status: 'Archived',
        featured: false,
        statusKey: 'DELETED',
      } as Record<string, unknown>)
      if (!propertyResult.ok) {
        patch((s) => ({
          ...s,
          properties: s.properties.map((x) => (x.id === id ? property : x)),
          propertyEvents: s.propertyEvents.filter((e) => e.id !== pe.id),
          units:
            prevUnit
              ? s.units.map((u) => (u.id === prevUnit.id ? prevUnit : u))
              : s.units,
        }))
        return {
          ok: false,
          reason: persistErrorMessage(propertyResult) ?? 'Could not delete property.',
        }
      }

      void persistUpsert('property_event', pe.id, pe as unknown as Record<string, unknown>)

      markLocalPersistWrite('property', id)

      emitSuiteEvent({
        agencyId: property.agencyId,
        resource: 'property',
        action: 'deleted',
        title: 'Property deleted',
        body: `“${property.title}” was moved to the archive.`,
        link: '/workspace/properties/archive',
        recipientUserIds: propertyDeskStakeholderIds(stateRef.current.users, property),
      })

      void refreshPublicMarketplaceInState()
      scheduleBootstrapRefreshAfterMutation()
      return { ok: true }
    },
    restoreProperty: async (id) => {
      const property = stateRef.current.properties.find((x) => x.id === id)
      if (!property?.deletedAt) {
        return { ok: false, reason: 'Property is not in the archive.' }
      }

      const viewerUserId = readStoredAuthUserId() ?? getApiActor()?.userId ?? null
      const actorUser = stateRef.current.users.find((u) => u.id === viewerUserId)
      if (
        !actorUser ||
        !canDeleteStoredProperty(
          { role: actorUser.role, userId: actorUser.id, agencyId: actorUser.agencyId },
          property,
        )
      ) {
        return { ok: false, reason: 'You do not have permission to restore this property.' }
      }

      const prevProperty = property
      const prevUnit = property.unitId
        ? stateRef.current.units.find((u) => u.id === property.unitId)
        : undefined

      const pe: PropertyEvent = {
        id: uid('pe'),
        agencyId: property.agencyId,
        propertyId: id,
        actorUserId: null,
        actorName: 'System',
        action: 'restored the Property',
        at: new Date().toISOString(),
        changes: [{ field: 'Status', from: 'Deleted', to: 'Draft' }],
      }

      patch((s) => ({
        ...s,
        properties: s.properties.map((x) =>
          x.id === id ? { ...x, deletedAt: null, status: 'Draft', featured: false } : x,
        ),
        propertyEvents: [pe, ...s.propertyEvents].slice(0, 400),
        units: property.unitId
          ? s.units.map((u) =>
              u.id === property.unitId ? { ...u, statusKey: 'DRAFT' } : u,
            )
          : s.units,
      }))

      const { persistErrorMessage } = await import('../lib/api/persist')
      const { markLocalPersistWrite } = await import('../lib/bootstrapMerge')
      if (property.unitId) {
        markLocalPersistWrite('unit', property.unitId)
      }

      const propertyResult = await persistUpsertResult('property', id, {
        ...property,
        restore: true,
        deletedAt: null,
        status: 'Draft',
        featured: false,
        statusKey: 'DRAFT',
      } as Record<string, unknown>)
      if (!propertyResult.ok) {
        patch((s) => ({
          ...s,
          properties: s.properties.map((x) => (x.id === id ? prevProperty : x)),
          propertyEvents: s.propertyEvents.filter((e) => e.id !== pe.id),
          units:
            prevUnit
              ? s.units.map((u) => (u.id === prevUnit.id ? prevUnit : u))
              : s.units,
        }))
        return {
          ok: false,
          reason: persistErrorMessage(propertyResult) ?? 'Could not restore property.',
        }
      }

      void persistUpsert('property_event', pe.id, pe as unknown as Record<string, unknown>)
      markLocalPersistWrite('property', id)

      emitSuiteEvent({
        agencyId: property.agencyId,
        resource: 'property',
        action: 'updated',
        title: 'Property restored',
        body: `“${property.title}” is back as a draft.`,
        link: `/workspace/properties/${id}`,
        recipientUserIds: propertyDeskStakeholderIds(stateRef.current.users, property),
      })

      void refreshPublicMarketplaceInState()
      scheduleBootstrapRefreshAfterMutation()
      return { ok: true }
    },
    createBuilding: (input) => {
      const building: Building = {
        ...input,
        id: uid('bld'),
        images: input.images?.length ? input.images : [],
        createdAt: new Date().toISOString().slice(0, 10),
      }
      patch((s) => ({ ...s, buildings: [building, ...s.buildings] }))
      addActivity(`Building created: ${building.name}`, 'System', building.clientId)
      persistUpsert('building', building.id, building as unknown as Record<string, unknown>)
      return building
    },
    createUnitFromTemplate: (input) => {
      const template = UNIT_TEMPLATES.find((t) => t.id === input.templateId) ?? UNIT_TEMPLATES[1]
      const building = state.buildings.find((b) => b.id === input.buildingId)
      const clientId = building?.clientId ?? 'ag-horizon'
      // P0-4: Use single ID for both property and unit
      const propertyId = uid('unt')
      const unitId = propertyId
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
      // P0-4: Create corresponding property with same ID for single public face
      const property: PropertyAsset = {
        id: propertyId,
        unitId,
        buildingId: input.buildingId,
        agencyId: clientId,
        landlordId: building?.landlordId ?? '',
        agentId: input.agentId,
        title: input.title,
        type: 'Apartment',
        status: 'Draft',
        listingMode: input.listingType === 'sale' ? 'sale' : 'rent',
        price: input.price,
        rent: input.rent,
        beds: template.bedrooms,
        baths: template.bathrooms,
        parking: template.parking,
        garages: template.parking,
        area: template.squareMeters,
        address: building?.addressLine1 ?? '',
        suburb: building?.suburb ?? '',
        city: building?.city ?? '',
        lat: building?.lat ?? 0,
        lng: building?.lng ?? 0,
        featured: false,
        images: building?.images ?? [],
        rooms: [],
        amenities: ['Fibre'],
        description: template.blurb,
        createdAt: new Date().toISOString().slice(0, 10),
      }

      patch((s) => ({
        ...s,
        properties: [property, ...s.properties],
        units: [unit, ...s.units],
        infraRooms: [...rooms, ...s.infraRooms],
        internalAssets: [...assets, ...s.internalAssets],
      }))
      addActivity(`Unit ${unit.unitNumber} created from ${template.label}`, 'System', clientId)
      persistUpsert('property', property.id, property as unknown as Record<string, unknown>)
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
        recipientUserIds: unitDeskStakeholderIds(
          state.users,
          row.unitId,
          state.units,
          state.properties,
          row.clientId,
        ),
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
        recipientUserIds: unitDeskStakeholderIds(
          state.users,
          room.unitId,
          state.units,
          state.properties,
          room.clientId,
        ),
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
          recipientUserIds: unitDeskStakeholderIds(
            state.users,
            room.unitId,
            state.units,
            state.properties,
            room.clientId,
          ),
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
          recipientUserIds: unitDeskStakeholderIds(
            state.users,
            asset.unitId,
            state.units,
            state.properties,
            asset.clientId,
          ),
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
        recipientUserIds: applicationStakeholderIds(
          state.users,
          app,
          state.properties.find((p) => p.id === app.propertyId),
        ),
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
      persistUpsert('document', doc.id, doc as unknown as Record<string, unknown>)
      return doc
    },
    updatePropertyDocument: (id, docPatch) => {
      patch((s) => ({
        ...s,
        propertyDocuments: s.propertyDocuments.map((d) => (d.id === id ? { ...d, ...docPatch } : d)),
      }))
      const next = { ...state.propertyDocuments.find((d) => d.id === id), ...docPatch, id }
      persistUpsert('document', id, next as Record<string, unknown>)
    },
    removePropertyDocument: (id) => {
      patch((s) => ({
        ...s,
        propertyDocuments: s.propertyDocuments.filter((d) => d.id !== id),
      }))
      persistDelete('document', id)
    },
    addPropertyEvent,
    createReview: (input) => {
      const rating = Math.round(input.rating)
      if (rating < 1 || rating > 5) return { error: 'Rating must be between 1 and 5.' }
      const body = input.body.trim()
      if (body.length < 8) return { error: 'Please write a short review (at least 8 characters).' }

      if (input.targetType === 'property') {
        const prop = state.properties.find((p) => p.id === input.targetId)
        if (!prop) return { error: 'Property not found.' }
      }
      if (input.targetType === 'application') {
        const app = state.applications.find((a) => a.id === input.targetId)
        if (!app) return { error: 'Application not found.' }
        if (app.applicantUserId && app.applicantUserId !== input.authorUserId) {
          return { error: 'You can only review your own application.' }
        }
      }
      if (input.targetType === 'agent') {
        const agent = state.users.find((u) => u.id === input.targetId)
        if (!agent) return { error: 'Agent not found.' }
      }

      const duplicate = state.reviews.find(
        (r) =>
          r.authorUserId === input.authorUserId &&
          r.targetType === input.targetType &&
          r.targetId === input.targetId,
      )
      if (duplicate) return { error: 'You already reviewed this.' }

      let propertyId = input.propertyId ?? null
      let agencyId = input.agencyId ?? null
      if (input.targetType === 'property') {
        const prop = state.properties.find((p) => p.id === input.targetId)
        propertyId = prop?.id ?? null
        agencyId = prop?.agencyId ?? agencyId
      }
      if (input.targetType === 'application') {
        const app = state.applications.find((a) => a.id === input.targetId)
        propertyId = app?.propertyId ?? propertyId
        agencyId = app?.agencyId ?? agencyId
      }
      if (input.targetType === 'agent' && propertyId) {
        const prop = state.properties.find((p) => p.id === propertyId)
        agencyId = prop?.agencyId ?? agencyId
      }

      const review: Review = {
        id: uid('RV'),
        targetType: input.targetType,
        targetId: input.targetId,
        propertyId,
        agencyId,
        authorUserId: input.authorUserId,
        authorName: input.authorName,
        rating,
        body,
        createdAt: new Date().toISOString(),
      }
      patch((s) => ({ ...s, reviews: [review, ...s.reviews] }))
      return review
    },
    createLead: (input) => {
      const lead: Lead = {
        ...input,
        id: input.id ?? uid('LD'),
        stage: input.stage ?? 'New Lead',
        notes: input.notes ?? '',
        createdAt: new Date().toISOString().slice(0, 10),
        updatedAt: new Date().toISOString().slice(0, 10),
      }
      patch((s) => ({ ...s, leads: [lead, ...s.leads] }))
      if (input.persist !== false) {
        persistUpsert('lead', lead.id, lead as unknown as Record<string, unknown>)
      }
      const property = state.properties.find((p) => p.id === lead.propertyId)
      emitSuiteEvent({
        agencyId: lead.agencyId,
        resource: 'applicant',
        action: 'created',
        title: 'New lead',
        body: `${lead.name} — ${property?.title ?? 'property enquiry'}.`,
        link: `/workspace/sales/crm/leads/${encodeURIComponent(lead.id)}`,
        recipientUserIds: leadStakeholderIds(state.users, lead, property),
      })
      return lead
    },
    recordGuestEnquiry: (input) => {
      const today = new Date().toISOString().slice(0, 10)
      const lead: Lead = {
        ...input.lead,
        notes: input.lead.notes ?? '',
        createdAt: input.lead.createdAt ?? today,
        updatedAt: input.lead.updatedAt ?? today,
      }
      patch((s) => {
        let viewingSlots = s.viewingSlots
        let viewings = s.viewings
        if (input.viewing) {
          const slot = s.viewingSlots.find((x) => x.id === input.viewing!.slotId)
          if (slot && slot.status === 'Open' && slot.booked < slot.capacity) {
            const booked = slot.booked + 1
            viewingSlots = s.viewingSlots.map((x) =>
              x.id === slot.id
                ? {
                    ...x,
                    booked,
                    status: booked >= x.capacity ? ('Full' as const) : x.status,
                  }
                : x,
            )
            viewings = [
              {
                id: input.viewing.id ?? uid('VW'),
                agencyId: input.viewing.agencyId,
                propertyId: input.viewing.propertyId,
                agentId: input.viewing.agentId ?? '',
                slotId: input.viewing.slotId,
                applicantName: input.viewing.applicantName,
                applicantEmail: input.viewing.applicantEmail,
                date: input.viewing.date,
                time: input.viewing.time,
                status: 'Scheduled' as const,
                attendance: '—',
              },
              ...s.viewings,
            ]
          }
        }
        return { ...s, leads: [lead, ...s.leads], viewingSlots, viewings }
      })
      const property = state.properties.find((p) => p.id === lead.propertyId)
      emitSuiteEvent({
        agencyId: lead.agencyId,
        resource: 'applicant',
        action: 'created',
        title: input.viewing ? 'Viewing enquiry' : 'New lead',
        body: `${lead.name} — ${property?.title ?? 'listing'}.`,
        link: input.viewing
          ? '/workspace/sales/viewings'
          : `/workspace/sales/crm/leads/${encodeURIComponent(lead.id)}`,
        recipientUserIds: leadStakeholderIds(state.users, lead, property),
      })
      if (input.viewing) {
        emitSuiteEvent({
          agencyId: input.viewing.agencyId,
          resource: 'viewing',
          action: 'created',
          title: 'Viewing booked',
          body: `${input.viewing.applicantName} scheduled for ${property?.title ?? 'a listing'}.`,
          link: '/workspace/sales/viewings',
          includeActor: false,
          recipientUserIds: viewingDeskStakeholderIds(state.users, input.viewing, property),
        })
      }
      persistUpsert('lead', lead.id, lead as unknown as Record<string, unknown>)
    },
    updateLeadStage: (id, stage) => {
      const updatedAt = new Date().toISOString().slice(0, 10)
      patch((s) => ({
        ...s,
        leads: s.leads.map((l) => (l.id === id ? { ...l, stage, updatedAt } : l)),
      }))
      const prev = state.leads.find((l) => l.id === id)
      if (prev) persistUpsert('lead', id, { ...prev, stage, updatedAt } as unknown as Record<string, unknown>)
      if (prev && stage !== prev.stage) {
        const property = state.properties.find((p) => p.id === prev.propertyId)
        emitSuiteEvent({
          agencyId: prev.agencyId,
          resource: 'applicant',
          action: 'updated',
          title: 'Lead stage changed',
          body: `${prev.name}: ${prev.stage} → ${stage}`,
          link: `/workspace/sales/crm/leads/${encodeURIComponent(id)}`,
          recipientUserIds: leadStakeholderIds(state.users, prev, property),
        })
      }
    },
    setLeadRequirementState: (leadId, stageValue, requirementId, p) => {
      const prev = state.leads.find((l) => l.id === leadId)
      if (!prev) return
      const current: LeadRequirementCompletion =
        prev.metadata?.stageProgress?.[stageValue]?.[requirementId] ?? { done: false }
      const next: LeadRequirementCompletion = {
        ...current,
        ...p,
        ...(p.done === true && !current.at ? { at: new Date().toISOString() } : {}),
      }
      const metadata: Lead['metadata'] = {
        ...prev.metadata,
        stageProgress: {
          ...prev.metadata?.stageProgress,
          [stageValue]: {
            ...prev.metadata?.stageProgress?.[stageValue],
            [requirementId]: next,
          },
        },
      }
      const updated = { ...prev, metadata }
      patch((s) => ({
        ...s,
        leads: s.leads.map((l) => (l.id === leadId ? updated : l)),
      }))
      persistUpsert('lead', leadId, updated as unknown as Record<string, unknown>)
    },
    closeLead: (id, input) => {
      const prev = state.leads.find((l) => l.id === id)
      if (!prev) return { ok: false, reason: 'Lead not found.' }
      if (isClosedLeadStage(prev.stage)) {
        return { ok: false, reason: 'This lead is already closed.' }
      }
      const allowed = closeOutcomesForLeadType(prev.type)
      if (!allowed.includes(input.stage)) {
        return { ok: false, reason: 'Invalid close outcome for this lead type.' }
      }
      const trimmed = input.reason.trim()
      if (trimmed.length < 4) {
        return { ok: false, reason: 'A close reason is required.' }
      }
      const updatedAt = new Date().toISOString().slice(0, 10)
      const stage = input.stage
      const notes = prev.notes.trim()
        ? `${prev.notes.trim()}\n\nClosed (${updatedAt}, ${closeOutcomeHistoryLabel(stage)}): ${trimmed}`
        : `Closed (${updatedAt}, ${closeOutcomeHistoryLabel(stage)}): ${trimmed}`
      patch((s) => ({
        ...s,
        leads: s.leads.map((l) =>
          l.id === id ? { ...l, stage, updatedAt, notes } : l,
        ),
      }))
      persistUpsert('lead', id, { ...prev, stage, updatedAt, notes } as unknown as Record<string, unknown>)
      const property = state.properties.find((p) => p.id === prev.propertyId)
      emitSuiteEvent({
        agencyId: prev.agencyId,
        resource: 'applicant',
        action: 'updated',
        title: 'Lead closed',
        body: `${prev.name} was marked ${closeOutcomeHistoryLabel(stage)} — ${trimmed}`,
        link: `/workspace/sales/crm/${encodeURIComponent(id)}`,
        recipientUserIds: leadStakeholderIds(state.users, prev, property),
      })
      return { ok: true, leadId: id, stage }
    },
    createApplication: async (input) => {
      const property =
        state.properties.find((p) => p.id === input.propertyId) ??
        findByListingId(state.properties, input.propertyId)
      const unit = resolveUnitForProperty(property, state.units)

      if (
        !input.skipGuards &&
        property &&
        !isPubliclyListed(property, { units: state.units, users: state.users })
      ) {
        return {
          status: 'ERROR',
          error: 'This property is not listed and cannot accept applications.',
          httpStatus: 422,
        } as SubmitApplicationResult
      }

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

      // P0-2 (E2E #2): the application must be owned by the submitting session
      // user only — never a stale/anonymous identity. Staff may still create on
      // behalf of an applicant via skipGuards.
      const applicantIdentity = input.applicantUserId?.trim()
      if (!input.skipGuards && (!applicantIdentity || applicantIdentity === 'guest')) {
        return {
          status: 'ERROR',
          error: 'Your session could not be verified — please sign in and apply again.',
          httpStatus: 401,
        } as SubmitApplicationResult
      }

      // P0-5 (E2E #2): product rule is one application per (listing, applicant) —
      // multiple DIFFERENT applicants on one listing are always allowed.
      if (
        !input.skipGuards &&
        applicantIdentity &&
        state.applications.some(
          (a) =>
            a.propertyId === input.propertyId &&
            (a.applicantUserId === applicantIdentity ||
              (!!input.email && a.email.toLowerCase() === input.email.toLowerCase())),
        )
      ) {
        return {
          status: 'ERROR',
          error: 'You already have an application on this listing. Track it in My applications.',
          httpStatus: 409,
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
      // P0-agent: keep only the listing's real assigned agent. An id that does
      // not exist in the user book (or a blank string) means "unassigned" —
      // the detail views must never invent a person.
      const agentId =
        input.agentId && state.users.some((u) => u.id === input.agentId) ? input.agentId : null
      // P0-sync (R9/R11): the application's agency must match the LISTING's agency.
      // A stale/blank payload agency wrote client_id NULL — the RLS select
      // policy then hid the row from every staff viewer, while the applicant's
      // optimistic copy still rendered. Deriving from the property keeps one
      // agency for the listing and everything on it.
      // Prefer listing agency; fall back to the unit's clientId (same FE agency id).
      // Public listing cards often omit agencyId (PR-1011 showed no Horizon
      // agency). Do not block the guest — the server inherits client_id from
      // the live listing/unit row. Still refuse when there is no listing to
      // resolve against.
      const agencyId = (
        property?.agencyId ||
        input.agencyId ||
        unit?.clientId ||
        ''
      ).trim()
      if (!agencyId && !input.propertyId?.trim()) {
        return {
          status: 'ERROR',
          error: 'This listing has no agency — application cannot be filed for staff review.',
          httpStatus: 422,
        } as SubmitApplicationResult
      }
      const initialWorkflow = initialWorkflowForCreate(input.type)
      const agencyRow = state.agencies.find((a) => a.id === agencyId)
      const journeySnapshot = defaultRentalJourneyForAgency(agencyRow?.settings)
      const employmentLine =
        input.employment?.trim() ||
        formatEmploymentSummary(input.employerName, input.jobTitle)
      const app: Application = {
        id: uid('APP'),
        agencyId,
        propertyId: input.propertyId,
        unitId: unit?.id ?? property?.unitId ?? null,
        agentId,
        applicantUserId: input.applicantUserId ?? null,
        applicantName: input.applicantName,
        email: input.email,
        phone: input.phone,
        type: input.type,
        workflowStatus: initialWorkflow.workflowStatus,
        stage: initialWorkflow.stage,
        progress: STAGE_PROGRESS['Documents Pending'],
        income: input.income ?? 0,
        employment: employmentLine,
        employerName: input.employerName?.trim() || undefined,
        jobTitle: input.jobTitle?.trim() || undefined,
        idNumberOrPassport: input.idNumberOrPassport,
        uploadedDocs: input.uploadedDocs,
        creditCheck: 'Not Started',
        creditConsent: false,
        documents,
        docs: [],
        viewingSlotId: null,
        notes: '',
        moveInDate: input.moveInDate,
        submittedAt: new Date().toISOString().slice(0, 10),
        updatedAt: new Date().toISOString().slice(0, 10),
        journeySnapshot,
        journeyVersion: journeySnapshot.version,
      }
      // P0-integrity: normalize once at creation so the stored stage label,
      // machine status and progress always agree — staff and applicant read
      // the same triple from here on.
      const normalizedApp = normalizeApplication(app)
      patch((s) => ({ ...s, applications: [normalizedApp, ...s.applications] }))
      addActivity(`Application started: ${app.applicantName}`, app.applicantName, app.agencyId)

      emitSuiteEvent({
        agencyId,
        resource: 'applicant',
        action: 'created',
        title: 'New application',
        body: `${input.applicantName} applied for ${property?.title ?? propertyRefLabel(input.propertyId)} (${input.type}).`,
        link: `/workspace/sales/applications/${encodeURIComponent(app.id)}`,
        actorUserId: input.applicantUserId ?? null,
        includeActor: false,
        recipientUserIds: applicationStakeholderIds(state.users, app, property),
      })
      if (input.applicantUserId) {
        notify({
          userId: input.applicantUserId,
          agencyId,
          title: 'Application submitted',
          body: `Your ${input.type.toLowerCase()} application for ${property?.title ?? 'the listing'} was received.`,
          link: `/workspace/portals/tenant/applications/${encodeURIComponent(app.id)}`,
          resource: 'applicant',
          action: 'created',
        })
      }

      // P0-integrity / P0-sync (R11): await durable persist. Guest My Apps must
      // not keep an optimistic APP that staff bootstrap can never load.
      const { PERSIST_WRITE_GATE_MESSAGE, canPersistWrites } = await import('../lib/auth/writeGate')
      const { readStoredAuthUserId: storedUser, getApiActor: apiActor } = await import('../lib/api/actorAuth')
      const saveApp = () =>
        persistUpsertResult('application', normalizedApp.id, normalizedApp as unknown as Record<string, unknown>)
      let saved = await saveApp()
      if (saved.ok === false && saved.error === PERSIST_WRITE_GATE_MESSAGE) {
        // Applied right after sign-in / registration: wait for the account's data
        // to finish loading (up to ~12 s), then save once more instead of failing.
        for (let i = 0; i < 40; i++) {
          await new Promise((r) => setTimeout(r, 300))
          const sessionUserId = apiActor()?.userId ?? storedUser()
          if (canPersistWrites(hydratedForUserIdRef.current, sessionUserId)) break
        }
        saved = await saveApp()
      }
      if (saved.ok === false) {
        patch((s) => ({
          ...s,
          applications: s.applications.filter((a) => a.id !== normalizedApp.id),
        }))
        const { applicationSaveMessage } = await import('../lib/applicationSaveError')
        return {
          status: 'ERROR',
          error: applicationSaveMessage(saved.error),
          httpStatus: 500,
        } as SubmitApplicationResult
      }

      // Additive: email confirmation to the applicant. Fire-and-forget — a
      // mail hiccup must never block or fail the application.
      void (async () => {
        const { resolveApiAuthorizationHeader } = await import('../lib/api/authClient')
        await fetch('/api/notify/application-received', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...actorHeaders(),
            ...(await resolveApiAuthorizationHeader()),
          },
          body: JSON.stringify({
            email: normalizedApp.email,
            applicantName: normalizedApp.applicantName,
            propertyTitle: property?.title,
            referenceCode: normalizedApp.id,
          }),
        }).catch(() => {})
      })()

      return app
    },
    captureApplicationScreeningConsent: async (applicationId, input) => {
      const prev = state.applications.find((a) => a.id === applicationId)
      if (!prev) return null
      let next: Application
      if (input?.adults?.length) {
        const roster = input.adults.map((a) => ({ name: a.name, idNumber: a.idNumber }))
        const withRoster = setCreditConsentAdultRoster(prev, roster)
        next = normalizeApplication(
          captureAdultCreditCheckConsents(withRoster, {
            adults: input.adults,
            grantedBy: input?.grantedBy ?? null,
          }),
        )
      } else {
        next = normalizeApplication(
          captureScreeningConsent(prev, {
            grantedBy: input?.grantedBy ?? null,
            method: input?.method ?? 'staff',
            note: input?.note,
          }),
        )
      }
      patch((s) => ({
        ...s,
        applications: s.applications.map((a) => (a.id === applicationId ? next : a)),
      }))
      const persisted = await persistApplicationOrRollback(applicationId, next, prev, {
        title: 'Consent not saved',
        text: 'Please try again.',
      })
      if (!persisted) return null
      return next
    },
    startApplicationScreening: async ({ applicationId, actorUserId }) => {
      const app = state.applications.find((a) => a.id === applicationId)
      if (!app) return { ok: false as const, error: 'Application not found' }
      const actorUser = state.users.find((u) => u.id === actorUserId)
      const started = await startScreening(app, {
        actorUserId,
        actorName: actorUser?.name ?? 'Agency',
      })
      if (started.ok === false) return { ok: false as const, error: started.error }
      const updated = normalizeApplication(started.application)
      const prevSnap = app
      patch((s) => ({
        ...s,
        applications: s.applications.map((a) => (a.id === applicationId ? updated : a)),
      }))
      const saved = await persistApplicationOrRollback(applicationId, updated, prevSnap, {
        title: 'Screening not saved',
        text: 'Please try again.',
      })
      if (!saved) return { ok: false as const, error: 'Could not save screening start' }
      addActivity(`Screening started for ${updated.applicantName}`, actorUser?.name ?? 'Agency', updated.agencyId)
      return { ok: true as const, application: updated }
    },
    overrideApplicationScreening: async ({ applicationId, actorUserId, newStatus, reason, score, externalReference }) => {
      const app = state.applications.find((a) => a.id === applicationId)
      if (!app) return { ok: false as const, error: 'Application not found' }
      const actorUser = state.users.find((u) => u.id === actorUserId)
      const result = overrideScreening(app, {
        newStatus,
        reason,
        byUserId: actorUserId,
        byName: actorUser?.name ?? 'Agency',
        score,
        externalReference,
      })
      if (result.ok === false) return { ok: false as const, error: result.error }
      const updated = normalizeApplication(result.application)
      const preSnap = app
      patch((s) => ({
        ...s,
        applications: s.applications.map((a) => (a.id === applicationId ? updated : a)),
      }))
      try {
        const { persistToApi } = await import('../lib/api/persist')
        const ok = await persistToApi({
          resource: 'application',
          action: 'upsert',
          id: applicationId,
          data: { ...(updated as unknown as Record<string, unknown>), id: applicationId },
        })
        if (!ok) throw new Error('screening override persist failed')
        const { markLocalPersistWrite } = await import('../lib/bootstrapMerge')
        markLocalPersistWrite('application', applicationId)
      } catch {
        patch((s) => ({
          ...s,
          applications: s.applications.map((a) => (a.id === applicationId ? preSnap : a)),
        }))
        return { ok: false as const, error: 'Could not save screening override' }
      }
      addActivity(
        `Screening override for ${updated.applicantName}: ${newStatus}`,
        actorUser?.name ?? 'Agency',
        updated.agencyId,
      )
      return { ok: true as const, application: updated }
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
        const property = state.properties.find((x) => x.id === prev.propertyId)
        emitSuiteEvent({
          agencyId: prev.agencyId,
          resource: 'applicant',
          action: 'updated',
          title: 'Applicant stage changed',
          body: `${prev.applicantName}: ${prev.stage} → ${p.stage}`,
          link: `/workspace/sales/applications/${encodeURIComponent(id)}`,
          recipientUserIds: applicationStakeholderIds(state.users, prev, property),
        })
        if (prev.applicantUserId) {
          notify({
            userId: prev.applicantUserId,
            agencyId: prev.agencyId,
            title: 'Application update',
            body: `Your application for ${state.properties.find((x) => x.id === prev.propertyId)?.title ?? 'a listing'} is now: ${p.stage}.`,
            link: `/workspace/portals/tenant/applications/${encodeURIComponent(id)}`,
            resource: 'applicant',
            action: 'updated',
          })
        }
      }
      if (prev) {
        const nextApp = {
          ...prev,
          ...p,
          updatedAt: new Date().toISOString().slice(0, 10),
        } as Application
        void persistApplicationOrRollback(id, nextApp, prev, {
          title: 'Application not saved',
          text: 'Please try again.',
        })
      }
    },
    setDocumentStatus: async (applicationId, key, status, note) => {
      // P0 Approve→occupancy: await durable persist (R8 contract). Optimistic
      // docs must not survive a failed write; mark local write only after success
      // so LiveSync cannot wipe verified pack after LOCAL_WRITE_TTL.
      const preSnap = stateRef.current.applications.find((a) => a.id === applicationId) ?? null
      if (!preSnap) return false
      let persisted: Application | null = null
      patch((s) => ({
        ...s,
        applications: s.applications.map((a) => {
          if (a.id !== applicationId) return a
          const documents = a.documents.map((d) =>
            d.key === key
              ? {
                  ...d,
                  status,
                  ...(note !== undefined ? { note, rejectedReason: status === 'rejected' ? note : d.rejectedReason } : {}),
                  ...(status === 'verified'
                    ? { reviewedAt: new Date().toISOString(), reviewedBy: 'Agency' }
                    : {}),
                }
              : d,
          )
          const uploaded = allDocsUploaded(documents)
          let next = appendWorkflowEvent(
            { ...a, documents },
            {
              stage: resolveWorkflowStatus(a),
              actionKey: status === 'verified' ? 'DOC_APPROVED' : status === 'rejected' ? 'DOC_REJECTED' : 'DOC_STATUS',
              actorName: 'Agency',
              summary:
                status === 'verified'
                  ? `Approved document: ${documents.find((d) => d.key === key)?.label ?? key}`
                  : status === 'rejected'
                    ? `Rejected document: ${documents.find((d) => d.key === key)?.label ?? key}${note ? ` — ${note}` : ''}`
                    : `Updated document: ${documents.find((d) => d.key === key)?.label ?? key} → ${status}`,
            },
          )
          if (uploaded && resolveWorkflowStatus(a) === 'documents_requested') {
            next = applyWorkflowTransition({ ...next, documents }, 'documents_uploaded')
          } else {
            next = normalizeApplication({ ...next, documents })
          }
          let result: Application = {
            ...next,
            docs: documents.filter((d) => d.status !== 'required').map((d) => d.label),
            updatedAt: new Date().toISOString().slice(0, 10),
          }
          if (key === 'credit_consent' && status !== 'required') {
            result = captureScreeningConsent(result, {
              method: 'document',
              grantedBy: 'Applicant',
              note: 'Consent document uploaded / verified',
            })
          }
          persisted = result
          return result
        }),
      }))
      if (!persisted) return false
      try {
        const { persistToApi } = await import('../lib/api/persist')
        const ok = await persistToApi({
          resource: 'application',
          action: 'upsert',
          id: applicationId,
          data: { ...(persisted as unknown as Record<string, unknown>), id: applicationId },
        })
        if (!ok) throw new Error('document status persist failed')
        const { markLocalPersistWrite } = await import('../lib/bootstrapMerge')
        markLocalPersistWrite('application', applicationId)
        return true
      } catch {
        patch((s) => ({
          ...s,
          applications: s.applications.map((a) => (a.id === applicationId ? preSnap : a)),
        }))
        return false
      }
    },
    uploadApplicationDocument: async (applicationId, key, file, actor) => {
      // Saved first, shown after: the document only reads as uploaded once
      // the server has stored it (the row shows a loader meanwhile).
      const current = stateRef.current.applications.find((a) => a.id === applicationId)
      if (!current) return false
      const next = applyDocumentUpload(current, key, file, actor)
      const ok = await persistUpsert(
        'application',
        applicationId,
        applicationUploadPayload(next, key, actor?.userId) as unknown as Record<string, unknown>,
      )
      if (!ok) return false
      patch((s) => ({
        ...s,
        applications: s.applications.map((a) =>
          a.id === applicationId ? applyDocumentUpload(a, key, file, actor) : a,
        ),
      }))
      return true
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
      const prev = state.applications.find((a) => a.id === id)
      if (prev) {
        const stage = to ?? prev.stage
        const nextApp = {
          ...prev,
          stage,
          progress: STAGE_PROGRESS[stage] ?? prev.progress,
          updatedAt: new Date().toISOString().slice(0, 10),
        } as Application
        void persistApplicationOrRollback(id, nextApp, prev)
      }
    },
    approveApplication: async (id, options) => {
      const app = state.applications.find((a) => a.id === id)
      const actorUserId = options?.actorUserId ?? getApiActor()?.userId ?? null
      const actorUser = actorUserId
        ? state.users.find((u) => u.id === actorUserId)
        : undefined

      // P0-approve (R8): snapshot of the pre-approve state. If the durable
      // mirror write fails, this restores the optimistic patch so the UI
      // never sticks at a stage the server did not commit (the round-8
      // "sticky 71%" false progress).
      const preApproveSnapshot = stateRef.current
      let result: PatchApplicationStatusResult = {
        status: 'ERROR',
        httpStatus: 404,
        error: 'Application not found',
        code: 'NOT_FOUND',
      } as PatchApplicationStatusResult
      let createdNotifications: AppNotification[] = []

      setState((s) => {
        const current = s.applications.find((a) => a.id === id)
        const actor = s.users.find((u) => u.id === (actorUserId ?? ''))
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
            userId: actorUserId ?? actorUser?.id ?? 'system',
            role: actor?.role ?? actorUser?.role ?? ('client_admin' as Role),
            agencyId: actor?.agencyId ?? actorUser?.agencyId ?? current?.agencyId ?? null,
            permissions: rolePermissions[actor?.role ?? actorUser?.role ?? 'client_admin'] ?? [],
          },
        })

        if (result.status === 'ERROR') return s
        const ok = result
        createdNotifications = []
        if (current?.applicantUserId) {
          createdNotifications.push({
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
          notifications: [...createdNotifications, ...s.notifications],
        }
      })

      if (result.status === 'SUCCESS') {
        const ok = result
        // P0-approve (R7): the deploy-side RPC inserts into leases without the
        // NOT NULL lease_reference column, so it can never commit (HTTP 400)
        // and is not idempotent across retries. The direct mirror writes below
        // (application upsert, lease via upsertTenancy with lease_reference,
        // payments) are now the durable transition — they gate the success UI.
        // The RPC stays best-effort for when a future deploy fixes it.
        void persistApproveApplication({
          applicationId: id,
          actorUserId: actorUserId ?? undefined,
          tenancy: ok.side_effects.lease
            ? (ok.side_effects.lease as unknown as Record<string, unknown>)
            : undefined,
        })

        // Mirror the approved application + side effects durably. The approve
        // machine leaves stage 'Awaiting Payment' with the machine's legacy
        // workflowStatus untouched, so the persisted row carries the workflow
        // engine's matching status — otherwise hydration (meta.workflow_status)
        // reverts the stage label on refresh (the round-7 "still 14%" symptom).
        // Keep the machine's stage/progress as-is: normalizeApplication would
        // relabel 'Awaiting Payment' → 'Deposit invoice issued' (50%), which
        // would not match the optimistic UI after a reload.
        // P0-agent (R8): repair the stale agent id on the durable write — the
        // listing's real assigned agent (or null) replaces whatever an earlier
        // defaulted write left on the row. No SQL needed; normal writes heal it.
        const approvedApp: Application = {
          ...ok.application,
          ...approvedApplicationFields(ok.application.type),
          agentId: stateRef.current.properties.find((p) => p.id === ok.application.propertyId)
            ?.agentId?.trim()
            ? (stateRef.current.properties.find((p) => p.id === ok.application.propertyId)
                ?.agentId as string)
            : null,
        }
        const approvedRemotely = await persistApprovedApplication({
          applicationId: id,
          application: approvedApp,
          lease: ok.side_effects.lease,
          payments: ok.side_effects.payments,
          notifications: createdNotifications,
        })
        if (app?.propertyId) {
          const prop = stateRef.current.properties.find((p) => p.id === app.propertyId)
          if (prop) {
            void persistUpsert('property', prop.id, {
              ...prop,
              status: app.type === 'Rental' ? 'Rented' : prop.status,
            } as unknown as Record<string, unknown>)
          }
        }
        addActivity(
          ok.layout.headline +
            (ok.checkout ? ` · ${ok.checkout.provider} checkout ${ok.checkout.payment_id}` : ''),
          actorUser?.name ?? 'Agency',
          app?.agencyId ?? null,
        )

        if (!approvedRemotely) {
          // P0-approve (R8): roll the optimistic patch back — stage, payments,
          // lease, unit/property status all return to their pre-approve values
          // so the UI reflects only what the server actually committed.
          const snapshot = preApproveSnapshot
          patch((s) => ({
            ...s,
            applications: snapshot.applications,
            payments: snapshot.payments,
            tenancies: snapshot.tenancies,
            units: snapshot.units,
            properties: snapshot.properties,
          }))
          // P0-approve: never report success when the durable write failed.
          return {
            ...ok,
            status: 'ERROR',
            httpStatus: 502,
            error:
              'The approval could not be saved. Nothing was changed — please try again.',
            code: 'PERSIST_FAILED',
          } as PatchApplicationStatusResult
        }

        // Roadmap Step 5: lease PDF + e-sign on APPROVE (not deposit paid).
        if (ok.side_effects.lease) {
          const leaseRow =
            stateRef.current.tenancies.find((t) => t.id === ok.side_effects.lease!.id) ??
            ok.side_effects.lease
          await issueLeasePackageForTenancy(leaseRow, {
            userId: actorUserId ?? undefined,
            name: actorUser?.name,
          })
        }
        if (approvedRemotely && app?.email) {
          const propTitle = stateRef.current.properties.find((p) => p.id === app.propertyId)?.title
          void (async () => {
            const { resolveApiAuthorizationHeader } = await import('../lib/api/authClient')
            await fetch('/api/notify/application-approved', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...actorHeaders(),
                ...(await resolveApiAuthorizationHeader()),
              },
              body: JSON.stringify({
                applicationId: id,
                email: app.email,
                applicantName: app.applicantName,
                propertyTitle: propTitle,
              }),
            }).catch(() => {})
          })()
        }
      }

      return result
    },
    advanceApplicationWorkflow: async ({
      applicationId,
      actorUserId,
      targetStatus,
      signature,
      capture,
    }) => {
      const app = state.applications.find((a) => a.id === applicationId)
      if (!app) {
        return {
          status: 'ERROR',
          httpStatus: 404,
          error: 'Application not found',
          code: 'NOT_FOUND',
        } as PatchApplicationStatusResult
      }

      const actorUser = state.users.find((u) => u.id === actorUserId)
      const permissions = rolePermissions[actorUser?.role ?? 'client_admin'] ?? []
      // P0-approve (R10): the RECOVER_APPROVE transition is gated on lease
      // existence — a lease-less application stuck past approval must be able
      // to run it here even though the optimistic store may not have the lease
      // row hydrated. The server-side ALLOWED check in patchApplicationStatus
      // is the real gate; this lookup only resolves the transition metadata.
      const hasLease = state.tenancies.some((t) => t.applicationId === app.id)
      let transition =
        getAvailableTransitions(app, permissions, hasLease).find((t) => t.to === targetStatus) ??
        getAvailableTransitions(app, permissions, true).find((t) => t.to === targetStatus)
      // P0-1 (R4): the shared template gates applicant-side steps behind
      // `applications.review`, which tenants never hold — so an applicant
      // submitting their own application was rejected with INVALID_TRANSITION
      // and the UI flickered back to the old status (E2E #3). The applicant
      // action layer guards the same transition by identity + portal.tenant;
      // if it offers the target for this actor's own application, run it.
      if (!transition && actorUser && app.applicantUserId === actorUser.id) {
        const applicantAction = buildApplicantApplicationActions({
          application: app,
          permissions,
        }).find((a) => a.payload_hint?.workflowStatus === targetStatus)
        if (applicantAction) {
          transition = {
            actionKey: applicantAction.key,
            from: resolveWorkflowStatus(app),
            to: targetStatus,
            label: applicantAction.label,
            hint: applicantAction.label,
            tone: (applicantAction.tone as WorkflowTransition['tone']) ?? 'secondary',
            requires: [],
          } as WorkflowTransition
        }
      }
      if (!transition) {
        return {
          status: 'ERROR',
          httpStatus: 422,
          error: `Cannot advance to ${targetStatus}`,
          code: 'INVALID_TRANSITION',
        } as PatchApplicationStatusResult
      }

      // Lease save carrying a signature made in this step (null: none).
      let leaseSignSave: Promise<boolean> | null = null
      // Roadmap Step 5: TENANT_SIGNED / LANDLORD_SIGNED must update real e-sign
      // status (not decorative workflow alone).
      if (
        transition.actionKey === 'TENANT_SIGNED' ||
        transition.actionKey === 'LANDLORD_SIGNED' ||
        transition.actionKey === 'MARK_LEASE_SIGNED'
      ) {
        const party =
          transition.actionKey === 'LANDLORD_SIGNED' ? ('landlord' as const) : ('tenant' as const)
        let lease = stateRef.current.tenancies.find((t) => t.applicationId === applicationId)
        // CR10 fix 6: a staff modal sign on a lease with no envelope issues one
        // through the existing issue path first, waits for that save, then
        // stamps through the server sign function below. Never stage-only.
        if (lease && !lease.eSign?.envelopeId && app.applicantUserId !== actorUserId) {
          const withEnvelope = await ensureLeaseEnvelopeForSign(lease, {
            issue: (l) => issueLeasePackageForTenancy(l, { userId: actorUserId, name: actorUser?.name }),
            envelopeSave: (id) => leaseESignSaves.current.get(id),
          })
          if (withEnvelope) lease = withEnvelope
          else {
            return {
              status: 'ERROR',
              httpStatus: 422,
              error: 'The lease signing envelope could not be issued. The signature was not recorded.',
              code: 'LEASE_SIGNATURE_NOT_RECORDED',
            } as PatchApplicationStatusResult
          }
        }
        // CR10: no stage-only signing. TENANT_SIGNED / LANDLORD_SIGNED carry
        // the sign dialog capture (drawn or own saved image, on-behalf
        // confirmation); MARK_LEASE_SIGNED is paper_mark. The server sign
        // function checks the signer and writes the lease_signed row.
        const paper = transition.actionKey === 'MARK_LEASE_SIGNED'
        if (lease?.eSign?.envelopeId && !paper && !signature?.signatureDataUrl) {
          return {
            status: 'ERROR',
            httpStatus: 422,
            error: 'Open the sign dialog and draw a signature to sign the lease.',
            code: 'LEASE_SIGNATURE_NOT_RECORDED',
          } as PatchApplicationStatusResult
        }
        if (lease?.eSign?.envelopeId) {
          // Signing attempted: until the signed lease is saved, the
          // application does not move.
          leaseSignSave = Promise.resolve(false)
          const signed = await recordLeaseSignature({
            eSign: lease.eSign,
            tenancyId: lease.id,
            party,
            signerName: signature?.signerName || actorUser?.name || app.applicantName,
            signatureDataUrl: paper ? undefined : await sendableSignature(signature?.signatureDataUrl),
            method: paper ? 'paper_mark' : signature?.method ?? 'drawn',
            onBehalfConfirmation: signature?.onBehalfConfirmation,
            ectaConsent: paper ? undefined : signature?.ectaConsent,
            actorUserId,
          })
          if (signed.ok) {
            const nextLease: Tenancy = { ...lease, eSign: signed.eSign }
            patch((s) => ({
              ...s,
              tenancies: s.tenancies.map((t) => (t.id === lease.id ? nextLease : t)),
            }))
            // The application write below waits for this save (Angela #80):
            // like recordTenancyLeaseSign's leaseSaved.then.
            // A failed save (coded or uncoded 403, 500, network) restores the
            // lease as it was, so the screen never shows an unsaved signature.
            leaseSignSave = persistUpsert('tenancy', nextLease.id, nextLease as unknown as Record<string, unknown>)
              .catch(() => false)
              .then((ok) => {
                if (!ok) {
                  patch((s) => ({
                    ...s,
                    tenancies: s.tenancies.map((t) => (t.id === lease.id && t.eSign === nextLease.eSign ? lease : t)),
                  }))
                }
                return ok
              })
            // Prefer real e-sign-derived workflow status when it advances further.
            const derived = workflowStatusFromESign(signed.eSign)
            if (derived && derived !== targetStatus) {
              // Keep staff-selected target when it matches; otherwise mirror e-sign.
            }
            void derived
          }
        } else if (lease) {
          // No envelope (applicant cannot issue one): never stage-only.
          leaseSignSave = Promise.resolve(false)
        }
      }

      if (transition.actionKey === 'GENERATE_LEASE' || transition.actionKey === 'SEND_LEASE') {
        const lease = stateRef.current.tenancies.find((t) => t.applicationId === applicationId)
        if (lease && !lease.leaseDocumentId) {
          await issueLeasePackageForTenancy(lease, {
            userId: actorUserId,
            name: actorUser?.name,
          })
        }
      }

      // Mode A renewals: OFFER/ACCEPT/DECLINE_RENEWAL must mutate the lease book
      // (beyond stage-only). People → Leases panel uses the dedicated store actions;
      // workflow path stays aligned.
      if (
        transition.actionKey === 'OFFER_RENEWAL' ||
        transition.actionKey === 'ACCEPT_RENEWAL' ||
        transition.actionKey === 'DECLINE_RENEWAL'
      ) {
        const lease = stateRef.current.tenancies.find((t) => t.applicationId === applicationId)
        if (lease) {
          const asOf = new Date().toISOString().slice(0, 10)
          let nextLease = lease
          if (transition.actionKey === 'OFFER_RENEWAL') {
            nextLease = offerRenewalOnBook(lease, { asOf })
          } else if (transition.actionKey === 'ACCEPT_RENEWAL') {
            const offered =
              (lease.renewalOps?.election ?? 'none') === 'offered'
                ? lease
                : offerRenewalOnBook(lease, { asOf })
            nextLease = acceptRenewalOnBook(offered, asOf).tenancy
          } else {
            nextLease = declineRenewalOnBook(lease, asOf).tenancy
          }
          patch((s) => ({
            ...s,
            tenancies: s.tenancies.map((t) => (t.id === nextLease.id ? nextLease : t)),
          }))
          persistUpsert(
            'tenancy',
            nextLease.id,
            nextLease as unknown as Record<string, unknown>,
          )
        }
      }

      // Approving through Agent review / Landlord review only moves the stage,
      // so a file can reach Generate lease with no lease to sign. Generate
      // lease then creates it through the approve path (lease, deposit and
      // first-rent invoices) but stays on the lease steps.
      const generatesMissingLease =
        transition.actionKey === 'GENERATE_LEASE' &&
        app.type === 'Rental' &&
        !stateRef.current.tenancies.some((t) => t.applicationId === applicationId)
      const approvedStage: WorkflowStatusKey =
        transition.effect === 'approve' ? approvedApplicationFields(app.type).workflowStatus : targetStatus
      if (transition.effect === 'approve' || generatesMissingLease) {
        // P0-approve (R8): same pre-approve snapshot + revert contract as
        // approveApplication — a failed durable write must not leave the
        // optimistic 71% stage behind.
        const preApproveSnapshot = stateRef.current
        let result: PatchApplicationStatusResult = {
          status: 'ERROR',
          httpStatus: 404,
          error: 'Application not found',
          code: 'NOT_FOUND',
        } as PatchApplicationStatusResult

        setState((s) => {
          const current = s.applications.find((a) => a.id === applicationId)
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
              userId: actorUserId,
              role: actorUser?.role ?? ('client_admin' as Role),
              agencyId: actorUser?.agencyId ?? current?.agencyId ?? null,
              permissions,
            },
          })

          if (result.status === 'ERROR') return s

          const normalized = normalizeApplication({
            ...result.application,
            workflowStatus: approvedStage,
          })

          return {
            ...s,
            applications: s.applications.map((a) => (a.id === applicationId ? normalized : a)),
            payments: result.side_effects.payments.length
              ? [...result.side_effects.payments, ...s.payments]
              : s.payments,
            tenancies: result.side_effects.lease ? [result.side_effects.lease, ...s.tenancies] : s.tenancies,
          }
        })

        if (result.status === 'SUCCESS') {
          // Narrow before awaits — `let result` loses discriminant across await.
          const ok = result
          const normalized = normalizeApplication({
            ...ok.application,
            workflowStatus: approvedStage,
          })
          // P0-approve (R7): shared durable transition — direct mirror writes
          // (application + lease with lease_reference + payments) gate success
          // UI; the RPC is best-effort only (see approveApplication).
          void persistApproveApplication({
            applicationId,
            actorUserId,
            tenancy: ok.side_effects.lease
              ? (ok.side_effects.lease as unknown as Record<string, unknown>)
              : undefined,
          })
          const approvedRemotely = await persistApprovedApplication({
            applicationId,
            application: normalized,
            lease: ok.side_effects.lease,
            payments: ok.side_effects.payments,
            notifications: [],
          })
          if (!approvedRemotely) {
            // P0-approve (R8): revert the optimistic patch before surfacing
            // the failure — the UI must match what the server committed.
            const snapshot = preApproveSnapshot
            patch((s) => ({
              ...s,
              applications: snapshot.applications,
              payments: snapshot.payments,
              tenancies: snapshot.tenancies,
              units: snapshot.units,
              properties: snapshot.properties,
            }))
            return {
              ...ok,
              status: 'ERROR',
              httpStatus: 502,
              error: 'The approval-effect branch could not be saved. Nothing was changed — please try again.',
              code: 'PERSIST_FAILED',
            } as PatchApplicationStatusResult
          }
          // API mode: the server writes these notices (server/acceptedElsewhere.ts).
          if (!isApiEnabled && isApplicantAcceptanceStatus(approvedStage)) {
            notifyAcceptedElsewhere({
              accepted: normalized,
              property: state.properties.find((p) => p.id === normalized.propertyId),
              applications: state.applications.map((a) =>
                a.id === applicationId ? normalized : a,
              ),
              users: state.users,
              notify,
            })
          }
          if (ok.side_effects.lease) {
            const leaseRow =
              stateRef.current.tenancies.find((t) => t.id === ok.side_effects.lease!.id) ??
              ok.side_effects.lease
            await issueLeasePackageForTenancy(leaseRow, {
              userId: actorUserId,
              name: actorUser?.name,
            })
          }
          return { ...ok, application: normalized }
        }
        return result
      }

      if (transition.effect === 'key_handover') {
        const stepped = normalizeApplication(applyWorkflowTransition(app, 'keys_handed_over'))
        patch((s) => ({
          ...s,
          applications: s.applications.map((a) => (a.id === applicationId ? stepped : a)),
        }))
        const updatedApp = normalizeApplication({
          ...stepped,
          workflowStatus: 'active_tenancy',
        })
        patch((s) => ({
          ...s,
          applications: s.applications.map((a) => (a.id === applicationId ? updatedApp : a)),
        }))
        const prevKey = stateRef.current.applications.find((a) => a.id === applicationId) ?? app
        await persistApplicationOrRollback(applicationId, updatedApp, prevKey)
        addActivity(`Key handover completed for ${updatedApp.applicantName}`, actorUser?.name ?? 'Agency', updatedApp.agencyId)
        return { status: 'SUCCESS', application: updatedApp }
      }

      // P0-1 (R4): persist the applicant's explicit submit as Submitted.
      // The previous auto-chain to documents_requested overwrote the status
      // in the same tick, so Submit appeared to flicker and revert (E2E #3);
      // staff now advance the submitted application themselves.
      // Signing step: the application moves only after the lease save with
      // the signature succeeded (the server checks the stored envelope).
      const notRecorded = await leaseSignatureSaved(
        leaseSignSave,
        app.applicantUserId === actorUserId ? 'applicant' : 'staff',
      )
      if (notRecorded) {
        return {
          status: 'ERROR' as const,
          httpStatus: 409 as const,
          error: notRecorded.error,
          code: notRecorded.code,
        }
      }
      let updated = normalizeApplication(applyWorkflowTransition(app, targetStatus))
      if (capture?.reason?.trim()) {
        const reason = capture.reason.trim()
        updated = { ...updated, declineReason: reason, notes: reason }
      }
      // Real screening: entering credit_check starts the provider (consent-gated).
      // Approve paths must never invent Passed — that lives in the screening pipeline only.
      if (targetStatus === 'credit_check') {
        const started = await startScreening(updated, {
          actorUserId,
          actorName: actorUser?.name ?? 'Agency',
        })
        if (started.ok === false) {
          return {
            status: 'ERROR' as const,
            httpStatus: 422 as const,
            error: started.error,
            code: 'INVALID_TRANSITION' as const,
          }
        }
        updated = normalizeApplication(started.application)
      }
      updated = appendWorkflowEvent(updated, {
        stage: resolveWorkflowStatus(updated),
        actionKey: transition.actionKey,
        actorUserId,
        actorName: actorUser?.name ?? 'Agency',
        summary: `${updated.applicantName}: ${updated.stage}`,
      })
      const preWorkflow = app
      patch((s) => ({
        ...s,
        applications: s.applications.map((a) => (a.id === applicationId ? updated : a)),
      }))
      const workflowSaved = await persistApplicationOrRollback(applicationId, updated, preWorkflow, {
        title: 'Workflow not saved',
        text: 'Please try again.',
      })
      if (!workflowSaved) {
        return {
          status: 'ERROR' as const,
          httpStatus: 502 as const,
          error: 'This workflow step could not be saved.',
          code: 'PERSIST_FAILED' as const,
        }
      }
      addActivity(
        `${updated.applicantName}: ${updated.stage}`,
        actorUser?.name ?? 'Agency',
        updated.agencyId,
      )
      if (targetStatus === 'rejected' && updated.applicantUserId) {
        const propertyTitle = state.properties.find((p) => p.id === updated.propertyId)?.title
        notify({
          userId: updated.applicantUserId,
          agencyId: updated.agencyId,
          title: 'Application update',
          body: updated.declineReason
            ? `Your application was not approved: ${updated.declineReason}`
            : 'Your application was not approved.',
          link: `/workspace/portals/tenant/applications/${encodeURIComponent(applicationId)}`,
          resource: 'applicant',
          action: 'updated',
        })
        if (updated.email) {
          void (async () => {
            const { resolveApiAuthorizationHeader } = await import('../lib/api/authClient')
            await fetch('/api/notify/application-declined', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...actorHeaders(),
                ...(await resolveApiAuthorizationHeader()),
              },
              body: JSON.stringify({
                applicationId,
                email: updated.email,
                applicantName: updated.applicantName,
                propertyTitle,
                reason: updated.declineReason,
              }),
            }).catch(() => {})
          })()
        }
      }
      // API mode: the server writes these notices (server/acceptedElsewhere.ts).
      if (!isApiEnabled && isApplicantAcceptanceStatus(targetStatus)) {
        notifyAcceptedElsewhere({
          accepted: updated,
          property: state.properties.find((p) => p.id === updated.propertyId),
          applications: state.applications.map((a) => (a.id === applicationId ? updated : a)),
          users: state.users,
          notify,
        })
      }
      return { status: 'SUCCESS', application: updated }
    },
    patchApplicationStatus: async ({ applicationId, actorUserId, request }) => {
      let result: PatchApplicationStatusResult = {
        status: 'ERROR',
        httpStatus: 404,
        error: 'Application not found',
        code: 'NOT_FOUND',
      } as PatchApplicationStatusResult
      let createdNotifications: AppNotification[] = []

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
        createdNotifications = []
        if (ok.api_status === 'APPROVED' && app?.applicantUserId) {
          createdNotifications.push({
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
          notifications: [...createdNotifications, ...s.notifications],
        }
      })

      if (result.status === 'SUCCESS') {
        const ok = result
        if (ok.api_status === 'APPROVED') {
          // P0-approve (R7): direct mirror writes gate success UI; RPC is
          // best-effort (see approveApplication — the deployed RPC cannot
          // commit without the lease_reference fix server-side).
          void persistApproveApplication({
            applicationId,
            actorUserId,
            tenancy: ok.side_effects.lease
              ? (ok.side_effects.lease as unknown as Record<string, unknown>)
              : undefined,
          })
          // Keep the machine's stage/progress (see note in approveApplication —
          // normalizeApplication would relabel the stage and break label
          // agreement across a reload).
          // P0-agent (R8): same agent repair as approveApplication.
          const approvedListingAgentId =
            stateRef.current.properties.find((p) => p.id === ok.application.propertyId)
              ?.agentId?.trim() || null
          const approvedApp: Application = {
            ...ok.application,
            ...approvedApplicationFields(ok.application.type),
            agentId: approvedListingAgentId,
          }
          const approvedRemotely = await persistApprovedApplication({
            applicationId,
            application: approvedApp,
            lease: ok.side_effects.lease,
            payments: ok.side_effects.payments,
            notifications: createdNotifications,
          })
          if (approvedRemotely && ok.side_effects.lease) {
            const leaseRow =
              stateRef.current.tenancies.find((t) => t.id === ok.side_effects.lease!.id) ??
              ok.side_effects.lease
            await issueLeasePackageForTenancy(leaseRow, {
              userId: actorUserId,
              name: stateRef.current.users.find((u) => u.id === actorUserId)?.name,
            })
          }
          if (!approvedRemotely) {
            return {
              ...ok,
              status: 'ERROR',
              httpStatus: 502,
              error: 'The approval could not be saved. Nothing was changed — please try again.',
              code: 'PERSIST_FAILED',
            } as PatchApplicationStatusResult
          }
        } else {
          await persistUpsert(
            'application',
            applicationId,
            ok.application as unknown as Record<string, unknown>,
          )
        }
        if (ok.api_status !== 'APPROVED') {
          for (const pay of ok.side_effects.payments) {
            await persistUpsert('payment', pay.id, pay as unknown as Record<string, unknown>)
          }
          if (ok.side_effects.lease) {
            await persistUpsert(
              'tenancy',
              ok.side_effects.lease.id,
              ok.side_effects.lease as unknown as Record<string, unknown>,
            )
          }
          for (const n of createdNotifications) {
            await persistUpsert('notification', n.id, n as unknown as Record<string, unknown>)
          }
        }
        const app = state.applications.find((a) => a.id === applicationId)
        const actorUser = state.users.find((u) => u.id === actorUserId)
        addActivity(
          ok.layout.headline +
            (ok.checkout ? ` · ${ok.checkout.provider} checkout ${ok.checkout.payment_id}` : ''),
          actorUser?.name ?? 'Agency',
          app?.agencyId ?? null,
        )
      }

      return result
    },
    scheduleMoveIn: (id, moveInDate, keyCollection) => {
      const app = state.applications.find((a) => a.id === id)
      if (!app) return
      const withEmail = { ...keyCollection, emailSentAt: new Date().toISOString() }
      const updatedApp: Application = {
        ...app,
        stage: 'Move-In Scheduled',
        progress: STAGE_PROGRESS['Move-In Scheduled'],
        moveInDate,
        keyCollection: withEmail,
        updatedAt: new Date().toISOString().slice(0, 10),
      }
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
      setState((s) => {
        if (!s.applications.some((a) => a.id === id)) return s
        return {
          ...s,
          applications: s.applications.map((a) => (a.id === id ? updatedApp : a)),
          notifications: [...notifications, ...s.notifications],
        }
      })
      void persistApplicationOrRollback(id, updatedApp, app)
      for (const n of notifications) {
        void persistUpsert('notification', n.id, n as unknown as Record<string, unknown>)
      }
      addActivity(`Key handover email sent to ${app.applicantName}`, 'System', app.agencyId)
    },
    completeKeyHandover: async (id) => {
      const app = state.applications.find((a) => a.id === id)
      if (!app) return
      const prop = state.properties.find((p) => p.id === app.propertyId)
      const existing = state.tenancies.find((t) => t.applicationId === app.id)
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
      const updatedApp: Application = normalizeApplication({
        ...app,
        workflowStatus: 'active_tenancy',
      })
      const updatedProp =
        prop && app.type === 'Rental' ? { ...prop, status: 'Rented' as const } : null

      setState((s) => {
        const current = s.applications.find((a) => a.id === id)
        if (!current) return s
        return {
          ...s,
          applications: s.applications.map((a) => (a.id === id ? updatedApp : a)),
          tenancies: existing
            ? s.tenancies.map((t) => (t.id === existing.id ? tenancy : t))
            : [tenancy, ...s.tenancies],
          properties: updatedProp
            ? s.properties.map((p) => (p.id === updatedProp.id ? updatedProp : p))
            : s.properties,
        }
      })
      const prevApp = app
      await persistApplicationOrRollback(id, updatedApp, prevApp)
      await persistUpsert('tenancy', tenancy.id, tenancy as unknown as Record<string, unknown>)
      if (updatedProp) {
        await persistUpsert('property', updatedProp.id, updatedProp as unknown as Record<string, unknown>)
      }
      addActivity(
        `Keys handed over — ${app.applicantName} is now an active occupant`,
        'Agency',
        app.agencyId,
      )
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
      persistUpsert('viewing_slot', slot.id, slot as unknown as Record<string, unknown>)
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
        recipientUserIds: viewingSlotDeskStakeholderIds(
          state.users,
          slot,
          state.properties.find((p) => p.id === slot.propertyId),
        ),
      })
      scheduleBootstrapRefreshAfterMutation()
      return slot
    },
    updateViewingSlot: (id, p) => {
      const prev = state.viewingSlots.find((slot) => slot.id === id)
      if (!prev) return

      const next: ViewingSlot = { ...prev, ...p }
      const scheduleChanged =
        (p.date !== undefined && p.date !== prev.date) ||
        (p.time !== undefined && p.time !== prev.time)
      const material = slotPatchIsMaterial(prev, p)
      const property = state.properties.find((row) => row.id === prev.propertyId)
      const linkedBefore = state.viewings.filter(
        (v) => v.slotId === id && v.status !== 'Cancelled',
      )
      const syncedViewings: Viewing[] = []

      patch((s) => {
        const viewingSlots = s.viewingSlots.map((slot) => (slot.id === id ? next : slot))
        let viewings = s.viewings
        if (scheduleChanged) {
          viewings = s.viewings.map((v) => {
            if (v.slotId !== id || v.status === 'Cancelled') return v
            const updated = { ...v, date: next.date, time: next.time }
            syncedViewings.push(updated)
            return updated
          })
        }
        return { ...s, viewingSlots, viewings }
      })

      persistUpsert('viewing_slot', id, next as unknown as Record<string, unknown>)
      for (const v of syncedViewings) {
        persistUpsert('viewing', v.id, v as unknown as Record<string, unknown>)
      }

      if (material && linkedBefore.length > 0) {
        const message = describeViewingSlotChanges(prev, p, property)
        const recipientIds = collectViewingAttendeeUserIds(
          state.users,
          state.applications,
          linkedBefore,
        )
        for (const userId of recipientIds) {
          const sample = linkedBefore.find(
            (v) =>
              state.users.find((u) => u.id === userId)?.email?.toLowerCase() ===
                v.applicantEmail?.toLowerCase(),
          ) ?? linkedBefore[0]
          notify({
            userId,
            agencyId: prev.agencyId,
            title: message.title,
            body: message.body,
            link: viewingNotificationLink(state.applications, sample),
            resource: 'viewing_slot',
            action: 'updated',
          })
        }
      }

      if (p.status && p.status !== prev.status) {
        emitSuiteEvent({
          agencyId: prev.agencyId,
          resource: 'viewing_slot',
          action: 'updated',
          title: p.status === 'Cancelled' ? 'Viewing slot cancelled' : 'Viewing slot updated',
          body: `${prev.title?.trim() || 'Viewing'} is now ${p.status}.`,
          link: `/workspace/sales/viewings/property/${prev.propertyId}`,
          recipientUserIds: viewingSlotDeskStakeholderIds(state.users, prev, property),
        })
      } else if (material) {
        emitSuiteEvent({
          agencyId: prev.agencyId,
          resource: 'viewing_slot',
          action: 'updated',
          title: 'Viewing slot updated',
          body: `${prev.title?.trim() || 'Viewing'} · ${next.date} ${next.time}`,
          link: `/workspace/sales/viewings/property/${prev.propertyId}`,
          recipientUserIds: viewingSlotDeskStakeholderIds(state.users, prev, property),
        })
      }

      if (material) {
        const changes: PropertyEvent['changes'] = []
        if (p.date !== undefined && p.date !== prev.date) {
          changes.push({ field: 'Date', from: prev.date, to: p.date })
        }
        if (p.time !== undefined && p.time !== prev.time) {
          changes.push({ field: 'Time', from: prev.time, to: p.time })
        }
        if (p.title !== undefined && p.title !== prev.title) {
          changes.push({ field: 'Title', from: prev.title ?? '—', to: p.title ?? '—' })
        }
        if (changes.length) {
          addPropertyEvent({
            agencyId: prev.agencyId,
            propertyId: prev.propertyId,
            actorUserId: prev.agentId,
            actorName: actorNameFromState(state, prev.agentId, 'Agent'),
            action: 'updated a Viewing slot',
            changes,
          })
        }
      }
      scheduleBootstrapRefreshAfterMutation()
    },
    removeViewing: (id) => {
      const viewing = state.viewings.find((v) => v.id === id)
      let updatedSlot: ViewingSlot | null = null
      setState((s) => {
        const row = s.viewings.find((v) => v.id === id)
        if (!row) return s
        let viewingSlots = s.viewingSlots
        if (row.slotId) {
          viewingSlots = viewingSlots.map((slot) => {
            if (slot.id !== row.slotId) return slot
            const booked = Math.max(0, slot.booked - 1)
            const next = {
              ...slot,
              booked,
              status: slot.status === 'Full' && booked < slot.capacity ? ('Open' as const) : slot.status,
            }
            updatedSlot = next
            return next
          })
        }
        return {
          ...s,
          viewings: s.viewings.filter((v) => v.id !== id),
          viewingSlots,
        }
      })
      persistDelete('viewing', id)
      if (updatedSlot) {
        persistUpsert(
          'viewing_slot',
          updatedSlot.id,
          updatedSlot as unknown as Record<string, unknown>,
        )
      }
      if (viewing) {
        const property = state.properties.find((p) => p.id === viewing.propertyId)
        emitSuiteEvent({
          agencyId: viewing.agencyId,
          resource: 'viewing',
          action: 'deleted',
          title: 'Viewing booking deleted',
          body: `${viewing.applicantName} was removed from a viewing.`,
          link: `/workspace/sales/viewings/property/${viewing.propertyId}`,
          recipientUserIds: viewingDeskStakeholderIds(state.users, viewing, property),
        })
      }
      scheduleBootstrapRefreshAfterMutation()
    },
    removeViewingSlot: (id) => {
      const slot = state.viewingSlots.find((s) => s.id === id)
      const linked = state.viewings.filter((v) => v.slotId === id)
      patch((s) => ({
        ...s,
        viewingSlots: s.viewingSlots.filter((row) => row.id !== id),
        viewings: s.viewings.map((v) =>
          v.slotId === id ? { ...v, slotId: null, status: 'Cancelled' as const } : v,
        ),
      }))
      persistDelete('viewing_slot', id)
      for (const v of linked) {
        persistUpsert('viewing', v.id, {
          ...v,
          slotId: null,
          status: 'Cancelled',
        } as unknown as Record<string, unknown>)
      }
      if (slot) {
        const property = state.properties.find((p) => p.id === slot.propertyId)
        emitSuiteEvent({
          agencyId: slot.agencyId,
          resource: 'viewing_slot',
          action: 'deleted',
          title: 'Viewing slot deleted',
          body: `${slot.title?.trim() || `${slot.date} ${slot.time}`} was deleted.`,
          link: `/workspace/sales/viewings/property/${slot.propertyId}`,
          recipientUserIds: viewingSlotDeskStakeholderIds(state.users, slot, property),
        })
      }
      scheduleBootstrapRefreshAfterMutation()
    },
    transferViewingSlot: (fromSlotId, toSlotId) => {
      let ok = false
      let agencyId: string | null = null
      let propertyId = ''
      let fromNext: ViewingSlot | null = null
      let toNext: ViewingSlot | null = null
      let movedViewings: Viewing[] = []
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
        fromNext = { ...from, booked: 0, status: 'Cancelled' as const }
        const booked = to.booked + movers.length
        toNext = {
          ...to,
          booked,
          status: booked >= to.capacity ? ('Full' as const) : to.status,
        }
        movedViewings = movers.map((v) => ({
          ...v,
          slotId: toSlotId,
          date: to.date,
          time: to.time,
          agentId: to.agentId,
        }))
        return {
          ...s,
          viewings: s.viewings.map((v) =>
            moverIds.has(v.id)
              ? { ...v, slotId: toSlotId, date: to.date, time: to.time, agentId: to.agentId }
              : v,
          ),
          viewingSlots: s.viewingSlots.map((slot) => {
            if (slot.id === fromSlotId) return fromNext!
            if (slot.id === toSlotId) return toNext!
            return slot
          }),
        }
      })
      if (ok) {
        if (fromNext) {
          persistUpsert('viewing_slot', fromNext.id, fromNext as unknown as Record<string, unknown>)
        }
        if (toNext) {
          persistUpsert('viewing_slot', toNext.id, toNext as unknown as Record<string, unknown>)
        }
        for (const v of movedViewings) {
          persistUpsert('viewing', v.id, v as unknown as Record<string, unknown>)
        }
        const transferProperty = state.properties.find((p) => p.id === propertyId)
        const transferSlot = toNext ?? fromNext
        emitSuiteEvent({
          agencyId,
          resource: 'viewing_slot',
          action: 'updated',
          title: 'Viewing slot transferred',
          body: 'Attendees were moved to another viewing slot.',
          link: propertyId
            ? `/workspace/sales/viewings/property/${propertyId}`
            : '/workspace/sales/viewings',
          recipientUserIds: transferSlot
            ? viewingSlotDeskStakeholderIds(state.users, transferSlot, transferProperty)
            : [],
        })
        scheduleBootstrapRefreshAfterMutation()
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
                      // Workflow stage untouched: stage follows workflowStatus
                      // (a tenant cannot move it by booking a viewing).
                      viewingSlotId: slotId,
                      updatedAt: new Date().toISOString().slice(0, 10),
                    }
                  : a,
              )
            : s.applications,
        }
      })
      if (created) {
        const slot = state.viewingSlots.find((x) => x.id === slotId)
        const booked = (slot?.booked ?? 0) + 1
        const slotPatch = slot
          ? {
              ...slot,
              booked,
              status: booked >= slot.capacity ? ('Full' as const) : slot.status,
            }
          : null
        // Slot write after the booking lands: for a tenant the server turns the
        // slot write into a live recount of bookings, which must include theirs.
        const bookingSaved = persistUpsert('viewing', created.id, created as unknown as Record<string, unknown>)
        if (slotPatch) {
          void bookingSaved.then(() =>
            persistUpsert(
              'viewing_slot',
              slotPatch.id,
              slotPatch as unknown as Record<string, unknown>,
            ),
          )
        }
        if (applicationId) {
          const app = state.applications.find((a) => a.id === applicationId)
          if (app) {
            // After the booking lands: for a tenant the server accepts
            // viewingSlotId only for a slot they hold a booking on.
            void bookingSaved.then(async () => {
              const nextApp = {
                ...app,
                viewingSlotId: slotId,
                updatedAt: new Date().toISOString().slice(0, 10),
              } as Application
              await persistApplicationOrRollback(applicationId, nextApp, app)
            })
          }
        }
        const property = state.properties.find((p) => p.id === created.propertyId)
        emitSuiteEvent({
          agencyId: created.agencyId,
          resource: 'viewing',
          action: 'created',
          title: 'Viewing booked',
          body: `${applicantName} booked ${property?.title ?? 'a viewing'} · ${created.date} ${created.time}`,
          link: `/workspace/sales/viewings/property/${encodeURIComponent(created.propertyId)}?booking=${encodeURIComponent(created.id)}`,
          recipientUserIds: viewingDeskStakeholderIds(state.users, created, property),
        })
        notifyViewingScheduled(notify, state.users, state.applications, created, property)
      }
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
      persistUpsert('viewing', viewing.id, viewing as unknown as Record<string, unknown>)
      const property = state.properties.find((p) => p.id === viewing.propertyId)
      emitSuiteEvent({
        agencyId: viewing.agencyId,
        resource: 'viewing',
        action: 'created',
        title: 'Viewing scheduled',
        body: `${viewing.applicantName} · ${property?.title ?? propertyRefLabel(viewing.propertyId)} · ${viewing.date} ${viewing.time}`,
        link: `/workspace/sales/viewings/property/${encodeURIComponent(viewing.propertyId)}?booking=${encodeURIComponent(viewing.id)}`,
        actorUserId: viewing.agentId,
        recipientUserIds: viewingDeskStakeholderIds(state.users, viewing, property),
      })
      notifyViewingScheduled(notify, state.users, state.applications, viewing, property, {
        excludeUserId: viewing.agentId,
      })
      scheduleBootstrapRefreshAfterMutation()
      return viewing
    },
    updateViewing: (id, p) => {
      const prev = state.viewings.find((v) => v.id === id)
      if (!prev) return

      let statusEvent: PropertyEvent | null = null
      const property = state.properties.find((row) => row.id === prev.propertyId)
      const bookingMessage = describeViewingBookingChanges(prev, p, property)

      patch((s) => {
        const row = s.viewings.find((v) => v.id === id)
        const viewings = s.viewings.map((v) => (v.id === id ? { ...v, ...p } : v))
        if (!row || !p.status || p.status === row.status) return { ...s, viewings }
        statusEvent = {
          id: uid('pe'),
          agencyId: row.agencyId,
          propertyId: row.propertyId,
          actorUserId: row.agentId,
          actorName: actorNameFromState(s, row.agentId, 'Agent'),
          action: 'changed the Viewing status',
          at: new Date().toISOString(),
          changes: [{ field: 'Status', from: row.status, to: p.status }],
        }
        return { ...s, viewings, propertyEvents: [statusEvent!, ...s.propertyEvents].slice(0, 400) }
      })

      const next = { ...prev, ...p, id }
      persistUpsert('viewing', id, next as Record<string, unknown>)

      if (statusEvent) {
        persistUpsert(
          'property_event',
          statusEvent.id,
          statusEvent as unknown as Record<string, unknown>,
        )
      }

      if (bookingMessage && prev.status !== 'Cancelled') {
        const userId = collectViewingAttendeeUserIds(state.users, state.applications, [prev])[0]
        if (userId) {
          notify({
            userId,
            agencyId: prev.agencyId,
            title: bookingMessage.title,
            body: bookingMessage.body,
            link: viewingNotificationLink(state.applications, prev),
            resource: 'viewing',
            action: 'updated',
          })
        }
        emitSuiteEvent({
          agencyId: prev.agencyId,
          resource: 'viewing',
          action: 'updated',
          title: bookingMessage.title,
          body: bookingMessage.body,
          link: prev.propertyId
            ? `/workspace/sales/viewings/property/${prev.propertyId}`
            : '/workspace/sales/viewings',
          recipientUserIds: viewingDeskStakeholderIds(state.users, prev, property),
        })
      }

      if (
        bookingMessage &&
        ((p.date !== undefined && p.date !== prev.date) ||
          (p.time !== undefined && p.time !== prev.time))
      ) {
        addPropertyEvent({
          agencyId: prev.agencyId,
          propertyId: prev.propertyId,
          actorUserId: prev.agentId,
          actorName: actorNameFromState(state, prev.agentId, 'Agent'),
          action: 'rescheduled a Viewing',
          changes: [
            ...(p.date !== undefined && p.date !== prev.date
              ? [{ field: 'Date', from: prev.date, to: p.date }]
              : []),
            ...(p.time !== undefined && p.time !== prev.time
              ? [{ field: 'Time', from: prev.time, to: p.time }]
              : []),
          ],
        })
      }

      const nextStatus = (p.status ?? prev.status) as Viewing['status']
      if (p.status && p.status !== prev.status && !bookingMessage) {
        notifyViewingStatusChanged(notify, state.users, state.applications, prev, nextStatus, property)
        emitSuiteEvent({
          agencyId: prev.agencyId,
          resource: 'viewing',
          action: 'updated',
          title: `Viewing ${nextStatus.toLowerCase()}`,
          body: `${prev.applicantName} · ${property?.title ?? propertyRefLabel(prev.propertyId)} · ${prev.date} ${prev.time}`,
          link: prev.propertyId
            ? `/workspace/sales/viewings/property/${prev.propertyId}?booking=${encodeURIComponent(prev.id)}`
            : '/workspace/sales/viewings',
          recipientUserIds: viewingDeskStakeholderIds(state.users, prev, property),
        })
      }
      scheduleBootstrapRefreshAfterMutation()
    },
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
      const paymentProperty = state.properties.find((p) => p.id === payment.propertyId)
      emitSuiteEvent({
        agencyId: payment.agencyId,
        resource: 'payment',
        action: 'created',
        title: 'Payment recorded',
        body: `${payment.type} · ${payment.partyName} is due.`,
        link: `/workspace/properties/${payment.propertyId}?tab=payments`,
        recipientUserIds: paymentDeskStakeholderIds(state.users, payment, paymentProperty),
      })
      if (payment.partyUserId) {
        notify({
          userId: payment.partyUserId,
          agencyId: payment.agencyId,
          title: 'Payment due',
          body: `${payment.type} of ${payment.amount} is due for ${state.properties.find((p) => p.id === payment.propertyId)?.title ?? 'your property'}.`,
          link: '/workspace/portals/tenant',
          resource: 'payment',
          action: 'created',
        })
      }
      persistUpsert('payment', payment.id, payment as unknown as Record<string, unknown>)
      return payment
    },
    markPaymentPaid: (id, details = 'EFT') => {
      const opts: MarkPaymentPaidDetails =
        typeof details === 'string' ? { method: details } : (details ?? { method: 'EFT' })
      const method = opts.method ?? 'EFT'
      const paidAt = opts.paidAt ?? new Date().toISOString().slice(0, 10)
      const before = state.payments.find((p) => p.id === id)
      let paidEvent: PropertyEvent | null = null
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
        paidEvent = event
        return {
          ...s,
          payments,
          applications,
          propertyEvents: [event, ...s.propertyEvents].slice(0, 400),
        }
      })
      if (before) {
        const paymentProperty = state.properties.find((p) => p.id === before.propertyId)
        emitSuiteEvent({
          agencyId: before.agencyId,
          resource: 'payment',
          action: 'updated',
          title: 'Payment marked paid',
          body: `${before.type} · ${before.partyName} was marked paid.`,
          link: `/workspace/properties/${before.propertyId}?tab=payments`,
          recipientUserIds: paymentDeskStakeholderIds(state.users, before, paymentProperty),
        })
        if (before.partyUserId) {
          notify({
            userId: before.partyUserId,
            agencyId: before.agencyId,
            title: 'Payment received',
            body: `Your ${before.type.toLowerCase()} payment was recorded as paid.`,
            link: '/workspace/portals/tenant',
            resource: 'payment',
            action: 'updated',
          })
        }
        persistUpsert('payment', id, {
          ...before,
          status: 'Paid',
          paidAt,
          method,
          reference: opts.reference ?? before.reference ?? null,
          paidAmount: opts.paidAmount ?? before.amount,
          notes: opts.notes ?? before.notes ?? null,
          attachments: opts.attachments ?? before.attachments ?? [],
          recordedByUserId: opts.recordedByUserId ?? before.recordedByUserId ?? null,
          recordedByName: opts.recordedByName ?? before.recordedByName ?? null,
        } as unknown as Record<string, unknown>)
      }
      if (paidEvent) {
        persistUpsert(
          'property_event',
          paidEvent.id,
          paidEvent as unknown as Record<string, unknown>,
        )
      }
    },
    removePayment: (id) => {
      const payment = state.payments.find((p) => p.id === id)
      if (!payment || (payment.status !== 'Due' && payment.status !== 'Overdue')) return false
      patch((s) => ({
        ...s,
        payments: s.payments.filter((p) => p.id !== id),
      }))
      persistDelete('payment', id)
      const paymentProperty = state.properties.find((p) => p.id === payment.propertyId)
      emitSuiteEvent({
        agencyId: payment.agencyId,
        resource: 'payment',
        action: 'deleted',
        title: 'Unpaid payment deleted',
        body: `${payment.type} · ${payment.partyName} was removed.`,
        link: `/workspace/properties/${payment.propertyId}?tab=payments`,
        recipientUserIds: paymentDeskStakeholderIds(state.users, payment, paymentProperty),
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
      persistUpsert('payment', id, { ...before, ...p, id } as Record<string, unknown>)
      if (p.status && p.status !== before.status) {
        addPropertyEvent({
          agencyId: before.agencyId,
          propertyId: before.propertyId,
          actorUserId: before.partyUserId,
          actorName: before.partyName,
          action: 'updated a Payment status',
          changes: [{ field: 'Status', from: before.status, to: p.status }],
        })
        const paymentProperty = state.properties.find((p) => p.id === before.propertyId)
        emitSuiteEvent({
          agencyId: before.agencyId,
          resource: 'payment',
          action: 'updated',
          title: 'Payment updated',
          body: `${before.type} · ${before.partyName} → ${p.status}.`,
          link: `/workspace/properties/${before.propertyId}?tab=payments`,
          recipientUserIds: paymentDeskStakeholderIds(state.users, before, paymentProperty),
        })
      }
    },
    runRentCycle: (asOfInput) => {
      const asOf = (asOfInput ?? new Date().toISOString().slice(0, 10)).slice(0, 10)
      const plan = planRentCycle({
        tenancies: state.tenancies,
        payments: state.payments,
        asOf,
      })

      const escalatedIds = new Set(plan.escalations.map((e) => e.paymentId))
      if (escalatedIds.size > 0) {
        const updatedRows: PaymentRecord[] = []
        setState((s) => {
          const payments = s.payments.map((p) => {
            if (!escalatedIds.has(p.id) || p.status !== 'Due') return p
            const next = { ...p, status: 'Overdue' as const }
            updatedRows.push(next)
            return next
          })
          return { ...s, payments }
        })
        for (const row of updatedRows) {
          persistUpsert('payment', row.id, row as unknown as Record<string, unknown>)
          const paymentProperty = state.properties.find((p) => p.id === row.propertyId)
          emitSuiteEvent({
            agencyId: row.agencyId,
            resource: 'payment',
            action: 'updated',
            title: 'Payment marked overdue',
            body: `${row.type} · ${row.partyName} is overdue (due ${row.dueDate}).`,
            link: `/workspace/operations/payments/${row.id}`,
            recipientUserIds: paymentDeskStakeholderIds(state.users, row, paymentProperty),
          })
        }
      }

      const created: PaymentRecord[] = []
      for (const input of plan.newRents) {
        const payment: PaymentRecord = {
          ...input,
          id: uid('PAY'),
          paidAt: null,
          method: null,
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
        const paymentProperty = state.properties.find((p) => p.id === payment.propertyId)
        emitSuiteEvent({
          agencyId: payment.agencyId,
          resource: 'payment',
          action: 'created',
          title: 'Rent scheduled',
          body: `${payment.type} · ${payment.partyName} due ${payment.dueDate} (in-app schedule).`,
          link: `/workspace/operations/payments/${payment.id}`,
          recipientUserIds: paymentDeskStakeholderIds(state.users, payment, paymentProperty),
        })
        if (payment.partyUserId) {
          notify({
            userId: payment.partyUserId,
            agencyId: payment.agencyId,
            title: 'Rent due',
            body: `${payment.type} of ${formatZAR(payment.amount)} is due ${payment.dueDate}.`,
            link: '/workspace/portals/tenant',
            resource: 'payment',
            action: 'created',
          })
        }
        persistUpsert('payment', payment.id, payment as unknown as Record<string, unknown>)
        created.push(payment)
      }

      return { escalated: escalatedIds.size, created, asOf }
    },
    sendDunningNotice: (paymentId, opts) => {
      const payment = state.payments.find((p) => p.id === paymentId)
      if (!payment) return { ok: false as const, reason: 'Payment not found' }
      const asOf = new Date().toISOString().slice(0, 10)
      if (!canSendDunningNotice(payment, asOf) && !opts?.stage) {
        return { ok: false as const, reason: 'Payment is not past due' }
      }
      const property = state.properties.find((p) => p.id === payment.propertyId)
      const draft = buildDunningNotice({
        payment,
        propertyTitle: property?.title ?? 'your property',
        asOf,
        stage: opts?.stage,
        amountLabel: formatZAR(payment.amount),
      })
      if (!draft) {
        return {
          ok: false as const,
          reason: 'Not yet in a dunning window (Day +3). Pass an explicit stage to send early.',
        }
      }

      const nextStatus = payment.status === 'Due' ? ('Overdue' as const) : payment.status
      const notes = appendDunningNotes(payment.notes, draft.notesLine)
      const next: PaymentRecord = {
        ...payment,
        status: nextStatus,
        notes,
      }
      patch((s) => ({
        ...s,
        payments: s.payments.map((p) => (p.id === paymentId ? next : p)),
      }))
      persistUpsert('payment', paymentId, next as unknown as Record<string, unknown>)

      if (payment.partyUserId) {
        notify({
          userId: payment.partyUserId,
          agencyId: payment.agencyId,
          title: draft.title,
          body: draft.body,
          link: '/workspace/portals/tenant',
          resource: 'payment',
          action: 'updated',
        })
      }

      // DQ-M4: optional Mailtrap dunning email (server flag ENABLE_EMAIL_DUNNING default OFF).
      // Resolve tenant email from partyUserId / tenancy; fire-and-forget — fail ≠ fail UI.
      {
        const tenantFromUser = payment.partyUserId
          ? state.users.find((u) => u.id === payment.partyUserId)?.email?.trim()
          : undefined
        const tenantFromTenancy = payment.tenancyId
          ? state.tenancies.find((t) => t.id === payment.tenancyId)?.tenantEmail?.trim()
          : undefined
        const tenantEmail = tenantFromUser || tenantFromTenancy || ''
        if (tenantEmail) {
          void fetch('/api/notify/dunning-notice', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...actorHeaders(),
              ...authHeaders(),
            },
            body: JSON.stringify({
              email: tenantEmail,
              tenantName: payment.partyName,
              title: draft.title,
              body: draft.body,
              stage: draft.stage,
              propertyTitle: property?.title,
              amountDisplay: formatZAR(payment.amount),
              dueDate: payment.dueDate,
              paymentId: payment.id,
            }),
          }).catch(() => {})
        }
      }

      emitSuiteEvent({
        agencyId: payment.agencyId,
        resource: 'payment',
        action: 'updated',
        title: draft.title,
        body: `${draft.body} Recorded by ${opts?.actorName ?? 'staff'}.`,
        link: `/workspace/operations/payments/${payment.id}`,
        recipientUserIds: paymentDeskStakeholderIds(state.users, payment, property),
        actorUserId: opts?.actorUserId ?? null,
      })
      addPropertyEvent({
        agencyId: payment.agencyId,
        propertyId: payment.propertyId,
        actorUserId: opts?.actorUserId ?? null,
        actorName: opts?.actorName ?? 'Staff',
        action: 'sent a dunning notice',
        changes: [
          { field: 'Dunning', from: payment.status, to: draft.stage },
          { field: 'Status', from: payment.status, to: nextStatus },
        ],
      })
      return { ok: true as const, stage: draft.stage }
    },

    offerLeaseRenewal: (tenancyId, input) => {
      const tenancy = stateRef.current.tenancies.find((t) => t.id === tenancyId)
      if (!tenancy) return { ok: false as const, reason: 'Tenancy not found' }
      const asOf = (input?.asOf ?? new Date().toISOString().slice(0, 10)).slice(0, 10)
      const next = offerRenewalOnBook(tenancy, {
        asOf,
        offeredEndDate: input?.offeredEndDate,
        offeredRent: input?.offeredRent,
        termMonths: input?.termMonths,
      })
      patch((s) => ({
        ...s,
        tenancies: s.tenancies.map((t) => (t.id === tenancyId ? next : t)),
      }))
      persistUpsert('tenancy', tenancyId, next as unknown as Record<string, unknown>)
      if (next.applicationId) {
        const app = stateRef.current.applications.find((a) => a.id === next.applicationId)
        // Soft stage flip to renewal_offered when currently active_tenancy
        if (app) {
          const status = resolveWorkflowStatus(app)
          if (status === 'active_tenancy') {
            const updated = normalizeApplication(
              applyWorkflowTransition(app, 'renewal_offered'),
            )
            patch((s) => ({
              ...s,
              applications: s.applications.map((a) => (a.id === updated.id ? updated : a)),
            }))
            persistUpsert(
              'application',
              updated.id,
              updated as unknown as Record<string, unknown>,
            )
          }
        }
      }
      if (next.tenantUserId) {
        notify({
          userId: next.tenantUserId,
          agencyId: next.agencyId,
          title: 'Renewal offered',
          body: `In-app renewal terms recorded for your lease (not CPA legal service).`,
          link: '/workspace/portals/tenant',
          resource: 'applicant',
          action: 'updated',
        })
      }
      return { ok: true as const }
    },

    acceptLeaseRenewal: (tenancyId, opts) => {
      const tenancy = stateRef.current.tenancies.find((t) => t.id === tenancyId)
      if (!tenancy) return { ok: false as const, reason: 'Tenancy not found' }
      const asOf = (opts?.asOf ?? new Date().toISOString().slice(0, 10)).slice(0, 10)
      if ((tenancy.renewalOps?.election ?? 'none') !== 'offered') {
        return { ok: false as const, reason: 'Offer renewal before accepting' }
      }
      const { tenancy: next, newEndDate, newRent } = acceptRenewalOnBook(tenancy, asOf)
      patch((s) => ({
        ...s,
        tenancies: s.tenancies.map((t) => (t.id === tenancyId ? next : t)),
      }))
      persistUpsert('tenancy', tenancyId, next as unknown as Record<string, unknown>)
      if (next.applicationId) {
        const app = stateRef.current.applications.find((a) => a.id === next.applicationId)
        if (app) {
          const status = resolveWorkflowStatus(app)
          if (status === 'renewal_offered' || status === 'active_tenancy') {
            const stepped =
              status === 'active_tenancy'
                ? applyWorkflowTransition(app, 'renewal_offered')
                : app
            const updated = normalizeApplication(applyWorkflowTransition(stepped, 'renewed'))
            patch((s) => ({
              ...s,
              applications: s.applications.map((a) => (a.id === updated.id ? updated : a)),
            }))
            persistUpsert(
              'application',
              updated.id,
              updated as unknown as Record<string, unknown>,
            )
          }
        }
      }
      if (next.tenantUserId) {
        notify({
          userId: next.tenantUserId,
          agencyId: next.agencyId,
          title: 'Lease renewed on book',
          body: `Term extended to ${newEndDate}; rent ${formatZAR(newRent)} (in-app — not auto e-sign).`,
          link: '/workspace/portals/tenant',
          resource: 'applicant',
          action: 'updated',
        })
      }
      return { ok: true as const, newEndDate, newRent }
    },

    declineLeaseRenewal: (tenancyId, opts) => {
      const tenancy = stateRef.current.tenancies.find((t) => t.id === tenancyId)
      if (!tenancy) return { ok: false as const, reason: 'Tenancy not found' }
      const asOf = (opts?.asOf ?? new Date().toISOString().slice(0, 10)).slice(0, 10)
      const { tenancy: next, noticeGivenAt } = declineRenewalOnBook(tenancy, asOf)
      patch((s) => ({
        ...s,
        tenancies: s.tenancies.map((t) => (t.id === tenancyId ? next : t)),
      }))
      persistUpsert('tenancy', tenancyId, next as unknown as Record<string, unknown>)
      if (next.applicationId) {
        const app = stateRef.current.applications.find((a) => a.id === next.applicationId)
        if (app) {
          const status = resolveWorkflowStatus(app)
          let stepped = app
          if (status === 'active_tenancy') {
            stepped = applyWorkflowTransition(app, 'renewal_offered')
          }
          const from = resolveWorkflowStatus(stepped)
          if (from === 'renewal_offered' || from === 'active_tenancy') {
            const updated = normalizeApplication(
              from === 'renewal_offered'
                ? applyWorkflowTransition(stepped, 'notice_given')
                : applyWorkflowTransition(stepped, 'notice_given'),
            )
            patch((s) => ({
              ...s,
              applications: s.applications.map((a) => (a.id === updated.id ? updated : a)),
            }))
            persistUpsert(
              'application',
              updated.id,
              updated as unknown as Record<string, unknown>,
            )
          }
        }
      }
      return { ok: true as const, noticeGivenAt }
    },

    markLeaseMonthToMonth: (tenancyId, opts) => {
      const tenancy = stateRef.current.tenancies.find((t) => t.id === tenancyId)
      if (!tenancy) return { ok: false as const, reason: 'Tenancy not found' }
      const asOf = (opts?.asOf ?? new Date().toISOString().slice(0, 10)).slice(0, 10)
      const next = markMonthToMonthOnBook(tenancy, asOf)
      patch((s) => ({
        ...s,
        tenancies: s.tenancies.map((t) => (t.id === tenancyId ? next : t)),
      }))
      persistUpsert('tenancy', tenancyId, next as unknown as Record<string, unknown>)
      return { ok: true as const }
    },

    sendCpaExpiryNotice: (tenancyId, opts) => {
      const tenancy = stateRef.current.tenancies.find((t) => t.id === tenancyId)
      if (!tenancy) return { ok: false as const, reason: 'Tenancy not found' }
      if (!tenancy.endDate) {
        return { ok: false as const, reason: 'Open-ended lease has no CPA notice window' }
      }
      const asOf = (opts?.asOf ?? new Date().toISOString().slice(0, 10)).slice(0, 10)
      const ops = ensureRenewalOps(tenancy, asOf)
      if (!canSendCpaExpiryNotice(tenancy.endDate, ops, asOf)) {
        return { ok: false as const, reason: 'CPA notice window not open yet' }
      }
      const property = stateRef.current.properties.find((p) => p.id === tenancy.propertyId)
      const draft = buildCpaExpiryNotice({
        tenantName: tenancy.tenantName,
        propertyTitle: property?.title ?? 'your property',
        leaseEnd: tenancy.endDate,
        asOf,
        late: ops.cpaNotice.late,
      })
      const nextOps = {
        ...ops,
        cpaNotice: {
          ...ops.cpaNotice,
          noticeSentAt: asOf,
          late: false,
          lateFlagNote: null,
        },
        auditNotes: [...(ops.auditNotes ?? []), draft.notesLine],
      }
      const synced = syncCpaNoticeClock(nextOps, tenancy.endDate, asOf)
      // Keep noticeSentAt; late cleared because notice was sent
      synced.cpaNotice.noticeSentAt = asOf
      synced.cpaNotice.late = false
      synced.cpaNotice.lateFlagNote = null
      const next: typeof tenancy = { ...tenancy, renewalOps: synced }
      patch((s) => ({
        ...s,
        tenancies: s.tenancies.map((t) => (t.id === tenancyId ? next : t)),
      }))
      persistUpsert('tenancy', tenancyId, next as unknown as Record<string, unknown>)
      if (tenancy.tenantUserId) {
        notify({
          userId: tenancy.tenantUserId,
          agencyId: tenancy.agencyId,
          title: draft.title,
          body: draft.body,
          link: '/workspace/portals/tenant',
          resource: 'applicant',
          action: 'updated',
        })
      }
      return { ok: true as const, late: draft.late }
    },

    setLeaseEscalation: (tenancyId, input) => {
      const tenancy = stateRef.current.tenancies.find((t) => t.id === tenancyId)
      if (!tenancy) return { ok: false as const, reason: 'Tenancy not found' }
      const asOf = (input.asOf ?? new Date().toISOString().slice(0, 10)).slice(0, 10)
      const next = setEscalationOnBook(tenancy, {
        escalationPct: input.escalationPct,
        nextEscalationOn: input.nextEscalationOn,
        asOf,
      })
      patch((s) => ({
        ...s,
        tenancies: s.tenancies.map((t) => (t.id === tenancyId ? next : t)),
      }))
      persistUpsert('tenancy', tenancyId, next as unknown as Record<string, unknown>)
      return { ok: true as const }
    },

    applyDueLeaseEscalations: (asOfInput, opts) => {
      const asOf = (asOfInput ?? new Date().toISOString().slice(0, 10)).slice(0, 10)
      const only = opts?.tenancyIds ? new Set(opts.tenancyIds) : null
      const due = planDueEscalations(stateRef.current.tenancies, asOf).filter(
        (row) => !only || only.has(row.tenancyId),
      )
      let applied = 0
      for (const row of due) {
        const tenancy = stateRef.current.tenancies.find((t) => t.id === row.tenancyId)
        if (!tenancy) continue
        const result = applyEscalationOnBook(tenancy, asOf)
        if (!result) continue
        const next = result.tenancy
        patch((s) => ({
          ...s,
          tenancies: s.tenancies.map((t) => (t.id === next.id ? next : t)),
        }))
        persistUpsert('tenancy', next.id, next as unknown as Record<string, unknown>)
        if (next.tenantUserId) {
          notify({
            userId: next.tenantUserId,
            agencyId: next.agencyId,
            title: 'Scheduled rent increase applied',
            body: `Book rent now ${formatZAR(next.rent)} (+${result.result.appliedPct}% scheduled — not live CPI).`,
            link: '/workspace/portals/tenant',
            resource: 'applicant',
            action: 'updated',
          })
        }
        applied += 1
      }
      return { applied, asOf }
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
      queuePersistBatch([
        { resource: 'thread', action: 'upsert', id: thread.id, data: thread as unknown as Record<string, unknown> },
        { resource: 'message', action: 'upsert', id: message.id, data: message as unknown as Record<string, unknown> },
      ])
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
      persistUpsert('message', message.id, message as unknown as Record<string, unknown>)
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
          recipientUserIds: messageThreadRecipientIds(thread, fromUserId),
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
        emitSuiteEvent({
          agencyId: ticket.agencyId,
          resource: 'maintenance',
          action: 'created',
          title: 'Emergency dispatch queued',
          body: `${ticket.title} — emergency priority registered.`,
          link: '/workspace/operations/maintenance',
          recipientUserIds: maintenanceDeskStakeholderIds(state.users, ticket, prop),
        })
      } else {
        emitSuiteEvent({
          agencyId: ticket.agencyId,
          resource: 'maintenance',
          action: 'created',
          title: 'Maintenance opened',
          body: `“${ticket.title}” · ${ticket.priority}`,
          link: `/workspace/properties/${ticket.propertyId}?tab=maintenance`,
          recipientUserIds: maintenanceDeskStakeholderIds(state.users, ticket, prop),
        })
      }
      persistUpsert('ticket', ticket.id, ticket as unknown as Record<string, unknown>)
      notifyMaintenanceOpened(notify, state.users, ticket, prop, ticket.reportedByUserId)
      scheduleBootstrapRefreshAfterMutation()
      return ticket
    },
    createMaintenanceTicket: ({ actorUserId, request, propertyId, tenancyId, extras }) => {
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
      if (tenancyId) ticket.tenancyId = tenancyId
      if (extras?.accessNotes) ticket.accessNotes = extras.accessNotes
      if (extras?.locationDetail) ticket.locationDetail = extras.locationDetail
      if (extras?.photoUrls?.length) {
        ticket.photoUrls = extras.photoUrls
        ticket.photos = extras.photoUrls.length
      }

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
        recipientUserIds: maintenanceDeskStakeholderIds(state.users, ticket, prop),
      })

      // A refused create (e.g. a 400 on priority) must not stay on screen as
      // logged: drop the optimistic ticket and let the caller show the error.
      const saved = persistUpsert('ticket', ticket.id, ticket as unknown as Record<string, unknown>).then((ok) => {
        if (!ok) {
          patch((s) => ({ ...s, tickets: s.tickets.filter((t) => t.id !== ticket.id) }))
        }
        return ok
      })
      // A tenant's fault: the server notifies the responsible person and the
      // landlord (a tenant may only write their own notifications).
      notifyMaintenanceOpened(notify, state.users, ticket, prop, actor.id, { reporterOnly: actor.role === 'tenant' })
      const emergencyQueued = toUiPriority(String(request.priority)) === 'Emergency'
      return {
        saved,
        status: 'TICKET_CREATED',
        ticket_id: ticket.id,
        message: 'Operational request registered in tenant maintenance pipeline.',
        httpStatus: 201,
        ticket,
        warrantyCovered,
        emergencyQueued,
      }
    },
    submitSupportTicket: async ({ actor, subject, body, category, attachments, pageUrl, userAgent }) => {
      const cleanSubject = subject.trim().slice(0, SUPPORT_SUBJECT_MAX)
      const cleanBody = body.trim().slice(0, SUPPORT_BODY_MAX)
      if (!actor.id || actor.id === 'guest') {
        return { ok: false as const, error: 'Sign in to raise a ticket.' }
      }
      if (!cleanSubject || !cleanBody) {
        return { ok: false as const, error: 'Add a subject and a description.' }
      }
      try {
        const { createSupportTicketApi } = await import('../lib/api/helpDeskApi')
        const ticket = await createSupportTicketApi({
          id: uid('HD'),
          subject: cleanSubject,
          body: cleanBody,
          category: category ?? 'other',
          pageUrl: pageUrl ?? null,
          userAgent: userAgent ?? null,
          attachments: attachments ?? [],
          submitterName: actor.name,
        })
        patch((s) => ({ ...s, supportTickets: [ticket, ...s.supportTickets.filter((t) => t.id !== ticket.id)] }))
        return { ok: true as const, ticket }
      } catch (err) {
        return {
          ok: false as const,
          error: err instanceof Error && err.message ? err.message : 'Your ticket could not be sent. Check your connection and try again.',
        }
      }
    },
    actOnSupportTicket: async ({ actorName, ticketId, act }) => {
      try {
        const { supportTicketActionApi } = await import('../lib/api/helpDeskApi')
        const ticket = await supportTicketActionApi(ticketId, act, actorName)
        patch((s) => ({
          ...s,
          supportTickets: s.supportTickets.map((t) => (t.id === ticket.id ? ticket : t)),
        }))
        return { ok: true as const, ticket }
      } catch (err) {
        return { ok: false as const, error: err instanceof Error && err.message ? err.message : 'That did not save. Try again.' }
      }
    },
    updateTicket: (id, p) => {
      const before = state.tickets.find((t) => t.id === id)
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
          if (err) return s
        }
        const merged = syncTicketPhotoCount({ ...ticket, ...p })
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
      if (before) {
        persistUpsert('ticket', id, { ...before, ...p, id } as Record<string, unknown>)
        const merged = syncTicketPhotoCount({ ...before, ...p })
        if (p.status && p.status !== before.status) {
          const property = state.properties.find((row) => row.id === before.propertyId)
          notifyMaintenanceStatusChanged(notify, state.users, before, merged, property)
          emitSuiteEvent({
            agencyId: before.agencyId,
            resource: 'maintenance',
            action: 'updated',
            title: 'Maintenance status changed',
            body: `“${merged.title}” is now ${merged.status}.`,
            link: `/workspace/operations/maintenance/${encodeURIComponent(id)}`,
            recipientUserIds: maintenanceDeskStakeholderIds(state.users, merged, property),
          })
        }
      }
      scheduleBootstrapRefreshAfterMutation()
    },
    assignContractorToTicket: ({ ticketId, contractorUserId, actorUserId }) => {
      const ticket = state.tickets.find((t) => t.id === ticketId)
      const actor = state.users.find((u) => u.id === actorUserId)
      if (!ticket || !actor) return false
      if (
        contractorUserId &&
        !isContractorApprovedForAgency(state.agencyContractors, ticket.agencyId, contractorUserId)
      ) {
        return false
      }
      const contractor = contractorUserId
        ? state.users.find((u) => u.id === contractorUserId)
        : null
      const now = new Date().toISOString()
      const patchBody: Partial<MaintenanceTicket> = {
        contractorId: contractorUserId,
        contractorAssignedAt: contractorUserId ? now : null,
        status:
          contractorUserId && ticket.status === 'Requested' ? 'In Progress' : ticket.status,
      }
      patch((s) => ({
        ...s,
        tickets: s.tickets.map((t) =>
          t.id === ticketId ? syncTicketPhotoCount({ ...t, ...patchBody }) : t,
        ),
      }))
      persistUpsert('ticket', ticketId, {
        ...ticket,
        ...patchBody,
      } as Record<string, unknown>)
      if (contractorUserId && contractor) {
        notify({
          userId: contractorUserId,
          agencyId: ticket.agencyId,
          title: 'New maintenance job assigned',
          body: `${ticket.title} · ${ticket.priority} priority — ${ticket.assetLabel}`,
          link: `/workspace/operations/maintenance/${encodeURIComponent(ticketId)}`,
          resource: 'maintenance',
          action: 'updated',
        })
        addPropertyEvent({
          agencyId: ticket.agencyId,
          propertyId: ticket.propertyId,
          actorUserId: actor.id,
          actorName: actor.name,
          action: 'assigned a contractor to maintenance',
          changes: [
            { field: 'Contractor', from: ticket.contractorId ?? '—', to: contractor.name },
          ],
        })
        addActivity(
          `Contractor ${contractor.name} linked to ${ticket.title}`,
          actor.name,
          ticket.agencyId,
        )
      }
      return true
    },
    updateMaintenanceTicketDetails: (id, p) => {
      const before = state.tickets.find((t) => t.id === id)
      if (!before) return
      const merged = syncTicketPhotoCount({ ...before, ...p })
      patch((s) => ({
        ...s,
        tickets: s.tickets.map((t) => (t.id === id ? merged : t)),
      }))
      persistUpsert('ticket', id, merged as unknown as Record<string, unknown>)
    },
    addAgencyContractor: (input) => {
      const row: AgencyContractor = { ...input, id: uid('AC') }
      patch((s) => ({ ...s, agencyContractors: [row, ...s.agencyContractors] }))
      addActivity(`Contractor added to roster`, actorNameFromState(state, input.addedByUserId, 'Agency'), input.agencyId)
      return row
    },
    updateAgencyContractor: (id, p) => {
      patch((s) => ({
        ...s,
        agencyContractors: s.agencyContractors.map((r) => (r.id === id ? { ...r, ...p } : r)),
      }))
    },
    removeTicket: (id) => {
      const ticket = state.tickets.find((t) => t.id === id)
      if (!ticket || ticket.status !== 'Requested') return false
      patch((s) => ({
        ...s,
        tickets: s.tickets.filter((t) => t.id !== id),
      }))
      const ticketProperty = state.properties.find((p) => p.id === ticket.propertyId)
      emitSuiteEvent({
        agencyId: ticket.agencyId,
        resource: 'maintenance',
        action: 'deleted',
        title: 'Maintenance deleted',
        body: `“${ticket.title}” was removed before work started.`,
        link: `/workspace/properties/${ticket.propertyId}?tab=maintenance`,
        recipientUserIds: maintenanceDeskStakeholderIds(state.users, ticket, ticketProperty),
      })
      persistDelete('ticket', id)
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

      persistUpsert('ticket', ticketId, next as unknown as Record<string, unknown>)
      if (resolved && ticket.internalAssetId && condition) {
        const asset = state.internalAssets.find((a) => a.id === ticket.internalAssetId)
        if (asset) {
          persistUpsert('asset', asset.id, {
            ...asset,
            condition,
            lastInspectedAt: new Date().toISOString().slice(0, 10),
            agencyId: ticket.agencyId,
            propertyId: ticket.propertyId,
            unitId: ticket.unitId,
          } as unknown as Record<string, unknown>)
        }
      }

      return {
        status: 'WORKFLOW_UPDATED',
        message: 'Operational steps recorded and linked physical configurations synchronized successfully.',
        httpStatus: 200,
        ticket: next,
        assetUpdated,
      }
    },
    runEmergencyEscalations: () => {
      const now = new Date()
      const escalatedTickets: MaintenanceTicket[] = []
      const notifications: AppNotification[] = []

      for (const t of state.tickets) {
        if (!needsEmergencyEscalationPrecise(t, now)) continue
        const next = { ...t, escalatedAt: now.toISOString() }
        escalatedTickets.push(next)
        const managers = state.users.filter(
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
      }

      const count = escalatedTickets.length
      if (!count) return 0

      const escalatedById = new Map(escalatedTickets.map((t) => [t.id, t]))
      setState((s) => ({
        ...s,
        tickets: s.tickets.map((t) => escalatedById.get(t.id) ?? t),
        notifications: [...notifications, ...s.notifications],
      }))
      for (const t of escalatedTickets) {
        persistUpsert('ticket', t.id, t as unknown as Record<string, unknown>)
      }
      for (const n of notifications) {
        persistUpsert('notification', n.id, n as unknown as Record<string, unknown>)
      }
      addActivity(
        `Escalated ${count} emergency maintenance to portfolio managers`,
        'Escalation worker',
        null,
      )
      return count
    },
    notify,
    addActivity,
    runClientBillingCycle: (clientId, periodStart, periodEnd, extraLineItems) => {
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
        extraLineItems,
      })
      patch((s) => ({ ...s, invoices: [invoice, ...s.invoices] }))
      persistUpsert('invoice', invoice.id, invoice as unknown as Record<string, unknown>)
      addActivity(
        `Billing cycle invoiced ${formatClient(clientId)} — ${invoice.totalAmountDue.toFixed(2)} ZAR`,
        'Billing engine',
        clientId,
      )
      return invoice
    },
    markInvoicePaid: (invoiceId) => {
      const prev = state.invoices.find((inv) => inv.id === invoiceId)
      patch((s) => ({
        ...s,
        invoices: s.invoices.map((inv) =>
          inv.id === invoiceId ? { ...inv, paymentStatus: 'PAID' as const } : inv,
        ),
      }))
      if (prev) {
        persistUpsert('invoice', invoiceId, {
          ...prev,
          paymentStatus: 'PAID',
        } as unknown as Record<string, unknown>)
      }
    },
    emitSuiteEvent,
    markNotificationRead: (id) => {
      patch((s) => ({
        ...s,
        notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
      }))
      void persistMarkNotificationsRead({ ids: [id] })
    },
    markAllNotificationsRead: (userId) => {
      patch((s) => ({
        ...s,
        notifications: s.notifications.map((n) =>
          n.userId === userId ? { ...n, read: true } : n,
        ),
      }))
      void persistMarkNotificationsRead({ userId, all: true })
    },
    dismissToast,
    allocateTrustReceipt,
    markTrustSuspense,
    importTrustTemplateCsv,
    upsertHeldDeposit,
    proposeDepositRelease: proposeDepositReleaseAction,
    approveDepositRelease: approveDepositReleaseAction,
    rejectDepositRelease: rejectDepositReleaseAction,
    cancelDepositRelease: cancelDepositReleaseAction,
    recordDepositRefund: recordDepositRefundAction,
    proposePayoutInstruction,
    approvePayoutInstruction,
    submitPayoutInstruction,
  }), [state, hydratedForUserId, hydrationFailed, resetToDefault, toasts, patch, addActivity, addPropertyEvent, notify, emitSuiteEvent, dismissToast, allocateTrustReceipt, markTrustSuspense, importTrustTemplateCsv, upsertHeldDeposit, proposeDepositReleaseAction, approveDepositReleaseAction, rejectDepositReleaseAction, cancelDepositReleaseAction, recordDepositRefundAction, proposePayoutInstruction, approvePayoutInstruction, submitPayoutInstruction, persistUpsert, persistUpsertResult, writeLookupRows, persistDelete, refreshBootstrap, refreshSessionData, refreshMarketplaceListings, scheduleBootstrapRefreshAfterMutation, issueLeasePackageForTenancy])

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

function actorNameFromState(s: AppState | { users: AppUser[] }, userId: string | null, fallback: string) {
  if (!userId) return fallback
  return s.users.find((u) => u.id === userId)?.name ?? fallback
}

function formatClient(clientId: string) {
  return clientId
}

/**
 * Where an approval lands: the lease is created and issued for signing, so the
 * file continues Lease generated -> sent -> tenant / landlord signed ->
 * deposit invoice. (Jumping to Deposit invoice issued skipped signing, and the
 * server refuses any stage past landlord_signed without the signed lease.)
 */
function approvedApplicationFields(type: Application['type']): { workflowStatus: WorkflowStatusKey; stage: string; progress: number } {
  const status: WorkflowStatusKey = type === 'Purchase' ? 'deposit_requested' : 'lease_generated'
  return { workflowStatus: status, stage: workflowStageLabel(type, status), progress: workflowProgress(type, status) }
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used within AppStoreProvider')
  return ctx
}

export function usePublicProperties() {
  const { state } = useStore()
  return state.properties.filter((p) =>
    isPubliclyListed(p, { units: state.units, users: state.users }),
  )
}
