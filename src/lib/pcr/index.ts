export type {
  InspectionKind,
  InspectionStatus,
  ItemCondition,
  IPcrPartnerAdapter,
  MaintenanceHandoffDraft,
  PcrInspectionItem,
  PcrInspectionRoom,
  PcrItemPhoto,
  PcrNoShowOverride,
  PcrPartnerCode,
  PcrPartnerUpsertResult,
  PcrPdfInput,
  PcrPdfResult,
  PcrSoftSignature,
  PropertyConditionInspection,
} from './types.js'
export { PcrNotConfiguredError } from './types.js'

export {
  PCR_MODE_A_COPY,
  addItemPhoto,
  countCheckedItems,
  createInspection,
  ensureIngoingInspection,
  ensureOutgoingInspection,
  findInspection,
  inspectionStatusLabel,
  isIngoingPcrSigned,
  listInspections,
  markInspectionCompleted,
  recordNoShowOrAdminOverride,
  setGeneralNotes,
  softSignStaff,
  softSignTenant,
  updateItemNotes,
  upsertInspectionOnApplication,
} from './inspections.js'

export {
  PCR_SOFT_GATED_ACTION_KEYS,
  applicationPassesPcrSoftGate,
  isIngoingPcrClearedForKeys,
  isPcrSoftGatedAction,
  pcrSoftGate,
  pcrSoftGateMessage,
  type PcrSoftGatedActionKey,
} from './softGate.js'

export {
  DEPOSIT_DAMAGE_SOFT_WARN,
  depositDamageWithoutOutgoingSoftWarn,
  refundDepositOutgoingSoftWarn,
} from './depositWarn.js'

export {
  ManualPcrAdapter,
  RefuseClosedPcrPartnerAdapter,
  assertPartnerNotLive,
  attemptLivePartnerPush,
  pcrPartnerAdapterFromEnv,
  type PcrAdapterKind,
} from './adapters.js'

export {
  cloneTemplateRooms,
  defaultResidentialTemplate,
} from './templates.js'

export {
  collectMaintenanceHandoffDrafts,
  handoffDraftToCreateTicketRequest,
} from './maintenanceHandoff.js'

export { downloadPcrPdf, generatePcrPdf } from './generatePcrPdf.js'
