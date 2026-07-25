/** South African home-loan calculator helpers (estimates only). */

export function monthlyPayment(principal: number, annualRatePct: number, years: number): number {
  if (principal <= 0 || years <= 0) return 0
  const r = annualRatePct / 100 / 12
  const n = years * 12
  if (r === 0) return principal / n
  const factor = Math.pow(1 + r, n)
  return (principal * r * factor) / (factor - 1)
}

export function maxLoanFromPayment(monthly: number, annualRatePct: number, years: number): number {
  if (monthly <= 0 || years <= 0) return 0
  const r = annualRatePct / 100 / 12
  const n = years * 12
  if (r === 0) return monthly * n
  const factor = Math.pow(1 + r, n)
  return (monthly * (factor - 1)) / (r * factor)
}

export type AmortScheduleRow = {
  month: number
  payment: number
  extra: number
  interest: number
  principal: number
  balance: number
}

export function amortize(
  principal: number,
  annualRatePct: number,
  years: number,
  extraMonthly = 0,
): { schedule: AmortScheduleRow[]; totalInterest: number; months: number; totalPaid: number } {
  const base = monthlyPayment(principal, annualRatePct, years)
  const r = annualRatePct / 100 / 12
  let balance = principal
  const schedule: AmortScheduleRow[] = []
  let totalInterest = 0
  let totalPaid = 0
  const maxMonths = years * 12 + 1

  for (let month = 1; month <= maxMonths && balance > 0.5; month++) {
    const interest = balance * r
    const scheduled = Math.min(base, balance + interest)
    const extra = Math.min(extraMonthly, Math.max(0, balance + interest - scheduled))
    const principalPart = Math.min(balance, scheduled + extra - interest)
    const payment = principalPart + interest
    balance = Math.max(0, balance - principalPart)
    totalInterest += interest
    totalPaid += payment
    schedule.push({
      month,
      payment,
      extra,
      interest,
      principal: principalPart,
      balance,
    })
  }

  return {
    schedule,
    totalInterest,
    months: schedule.length,
    totalPaid,
  }
}

/** SARS transfer duty (natural person) — simplified brackets. */
export function transferDuty(purchasePrice: number): number {
  if (purchasePrice <= 1_100_000) return 0
  if (purchasePrice <= 1_512_500) return (purchasePrice - 1_100_000) * 0.03
  if (purchasePrice <= 2_057_500) return 12_375 + (purchasePrice - 1_512_500) * 0.06
  if (purchasePrice <= 2_722_500) return 45_075 + (purchasePrice - 2_057_500) * 0.08
  if (purchasePrice <= 12_100_000) return 98_275 + (purchasePrice - 2_722_500) * 0.11
  return 1_129_800 + (purchasePrice - 12_100_000) * 0.13
}

/** Guideline conveyancing / bond attorney fees (illustrative sliding scale). */
function slidingFee(amount: number): number {
  if (amount <= 0) return 0
  if (amount <= 500_000) return 8_500 + amount * 0.012
  if (amount <= 1_000_000) return 14_500 + (amount - 500_000) * 0.008
  if (amount <= 2_000_000) return 18_500 + (amount - 1_000_000) * 0.005
  if (amount <= 5_000_000) return 23_500 + (amount - 2_000_000) * 0.0035
  return 34_000 + (amount - 5_000_000) * 0.002
}

export function bondAndTransferCosts(purchasePrice: number, bondAmount: number) {
  const duty = transferDuty(purchasePrice)
  const transferAttorney = slidingFee(purchasePrice)
  const bondAttorney = slidingFee(bondAmount)
  const deedsOfficeTransfer = Math.min(4_500, 500 + purchasePrice * 0.0004)
  const deedsOfficeBond = Math.min(4_000, 400 + bondAmount * 0.00035)
  const vatRate = 0.15
  const transferVat = transferAttorney * vatRate
  const bondVat = bondAttorney * vatRate
  const total =
    duty +
    transferAttorney +
    transferVat +
    bondAttorney +
    bondVat +
    deedsOfficeTransfer +
    deedsOfficeBond

  return {
    transferDuty: duty,
    transferAttorney,
    transferVat,
    bondAttorney,
    bondVat,
    deedsOfficeTransfer,
    deedsOfficeBond,
    total,
  }
}

export function parseMoney(value: string): number {
  const n = Number(String(value).replace(/[^\d.]/g, ''))
  return Number.isFinite(n) ? n : 0
}
