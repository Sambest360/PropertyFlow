/** Billing engine — SaaS charges from asset footprint (GLA, units, rooms, Grade P). */

export const SA_VAT_RATE = 0.15

export type BillingPlan = {
  id: string
  planName: string
  baseMonthlyFee: number
  perSqmRate: number
  perUnitRate: number
  perRoomRate: number
  gradePPremiumFee: number
  isActive: boolean
}

export type ClientSubscription = {
  id: string
  clientId: string
  planId: string
  billingCycleAnchorDay: number
  status: 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'TRIAL'
  updatedAt: string
}

/** kind 'screening': screening-check charges (server/screeningChecks.ts), billed before VAT. */
export type InvoiceLineItem = { label: string; amount: number; kind?: 'screening' }

export type PlatformInvoice = {
  id: string
  clientId: string
  subscriptionId: string | null
  billingPeriodStart: string
  billingPeriodEnd: string
  baseAmount: number
  assetUsageAmount: number
  vatAmount: number
  totalAmountDue: number
  paymentStatus: 'UNPAID' | 'PAID' | 'FAILED' | 'VOID'
  lineItems: InvoiceLineItem[]
  createdAt: string
}

export type BillingUsageInput = {
  clientId: string
  buildings: Array<{ id: string; clientId: string; grading: string }>
  units: Array<{ id: string; buildingId: string; squareMeters: number }>
  rooms: Array<{ id: string; unitId: string }>
}

export type UsageBreakdown = {
  clientId: string
  unitCount: number
  roomCount: number
  totalGlaSqm: number
  gradePBuildingCount: number
  sqmCharge: number
  unitCharge: number
  roomCharge: number
  gradingPremium: number
  assetUsageAmount: number
}

export function calculateUsage(
  input: BillingUsageInput,
  plan: BillingPlan,
): UsageBreakdown {
  const buildings = input.buildings.filter((b) => b.clientId === input.clientId)
  const buildingIds = new Set(buildings.map((b) => b.id))
  const units = input.units.filter((u) => buildingIds.has(u.buildingId))
  const unitIds = new Set(units.map((u) => u.id))
  const rooms = input.rooms.filter((r) => unitIds.has(r.unitId))

  const totalGlaSqm = units.reduce((s, u) => s + (u.squareMeters || 0), 0)
  const gradePBuildingCount = buildings.filter((b) => b.grading === 'P' || b.grading === 'Grade P').length

  const sqmCharge = totalGlaSqm * plan.perSqmRate
  const unitCharge = units.length * plan.perUnitRate
  const roomCharge = rooms.length * plan.perRoomRate
  const gradingPremium = gradePBuildingCount * plan.gradePPremiumFee
  const assetUsageAmount = round2(sqmCharge + unitCharge + roomCharge + gradingPremium)

  return {
    clientId: input.clientId,
    unitCount: units.length,
    roomCount: rooms.length,
    totalGlaSqm: round2(totalGlaSqm),
    gradePBuildingCount,
    sqmCharge: round2(sqmCharge),
    unitCharge: round2(unitCharge),
    roomCharge: round2(roomCharge),
    gradingPremium: round2(gradingPremium),
    assetUsageAmount,
  }
}

export function buildInvoice(params: {
  id: string
  clientId: string
  subscriptionId: string | null
  plan: BillingPlan
  usage: UsageBreakdown
  periodStart: string
  periodEnd: string
  createdAt?: string
  /** Extra pre-VAT charges, e.g. screening checks. */
  extraLineItems?: InvoiceLineItem[]
}): PlatformInvoice {
  const baseAmount = round2(params.plan.baseMonthlyFee)
  const assetUsageAmount = params.usage.assetUsageAmount
  const extras = params.extraLineItems ?? []
  const extrasAmount = round2(extras.reduce((sum, li) => sum + li.amount, 0))
  const subtotal = baseAmount + assetUsageAmount + extrasAmount
  const vatAmount = round2(subtotal * SA_VAT_RATE)
  const totalAmountDue = round2(subtotal + vatAmount)

  const lineItems: InvoiceLineItem[] = [
    { label: 'Base monthly fee', amount: baseAmount },
    { label: `GLA charge (${params.usage.totalGlaSqm} m² × R${params.plan.perSqmRate})`, amount: params.usage.sqmCharge },
    { label: `Unit charge (${params.usage.unitCount} × R${params.plan.perUnitRate})`, amount: params.usage.unitCharge },
    { label: `Room charge (${params.usage.roomCount} × R${params.plan.perRoomRate})`, amount: params.usage.roomCharge },
    { label: `Grade P premium (${params.usage.gradePBuildingCount})`, amount: params.usage.gradingPremium },
    ...extras,
    { label: 'VAT 15%', amount: vatAmount },
  ]

  return {
    id: params.id,
    clientId: params.clientId,
    subscriptionId: params.subscriptionId,
    billingPeriodStart: params.periodStart,
    billingPeriodEnd: params.periodEnd,
    baseAmount,
    assetUsageAmount,
    vatAmount,
    totalAmountDue,
    paymentStatus: 'UNPAID',
    lineItems,
    createdAt: params.createdAt ?? new Date().toISOString(),
  }
}

/** Midnight worker: generate invoice for a client on their billing anchor day. */
export function runBillingCycle(params: {
  clientId: string
  subscription: ClientSubscription
  plan: BillingPlan
  usageInput: BillingUsageInput
  periodStart: string
  periodEnd: string
  invoiceId: string
  extraLineItems?: InvoiceLineItem[]
}): PlatformInvoice {
  const usage = calculateUsage({ ...params.usageInput, clientId: params.clientId }, params.plan)
  return buildInvoice({
    id: params.invoiceId,
    clientId: params.clientId,
    subscriptionId: params.subscription.id,
    plan: params.plan,
    usage,
    periodStart: params.periodStart,
    periodEnd: params.periodEnd,
    extraLineItems: params.extraLineItems,
  })
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

export const SEED_BILLING_PLANS: BillingPlan[] = [
  {
    id: 'plan-standard',
    planName: 'Standard',
    baseMonthlyFee: 1499,
    perSqmRate: 0.05,
    perUnitRate: 2,
    perRoomRate: 0.5,
    gradePPremiumFee: 2500,
    isActive: true,
  },
  {
    id: 'plan-premium',
    planName: 'Premium Enterprise',
    baseMonthlyFee: 4999,
    perSqmRate: 0.04,
    perUnitRate: 1.5,
    perRoomRate: 0.35,
    gradePPremiumFee: 1500,
    isActive: true,
  },
]

export const SEED_SUBSCRIPTIONS: ClientSubscription[] = [
  {
    id: 'sub-horizon',
    clientId: 'ag-horizon',
    planId: 'plan-premium',
    billingCycleAnchorDay: 1,
    status: 'ACTIVE',
    updatedAt: '2026-07-01',
  },
  {
    id: 'sub-cape',
    clientId: 'ag-cape',
    planId: 'plan-standard',
    billingCycleAnchorDay: 15,
    status: 'ACTIVE',
    updatedAt: '2026-07-01',
  },
  {
    id: 'sub-garden',
    clientId: 'ag-garden',
    planId: 'plan-standard',
    billingCycleAnchorDay: 5,
    status: 'ACTIVE',
    updatedAt: '2026-07-01',
  },
]
