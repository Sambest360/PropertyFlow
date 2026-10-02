/**
 * PCR partner adapters (Mode A).
 * Manual path only; PropertyInspect / RedRabbit placeholders hard-refuse live HTTP.
 */

import type {
  IPcrPartnerAdapter,
  PcrPartnerCode,
  PcrPartnerUpsertResult,
  PropertyConditionInspection,
} from './types'
import { PcrNotConfiguredError } from './types'

/** In-app / export pack only — zero partner credentials required. */
export class ManualPcrAdapter implements IPcrPartnerAdapter {
  readonly id = 'manual_pcr'
  readonly live = false
  readonly configured = true
  readonly partnerCode: PcrPartnerCode = 'manual'

  async pushInspection(_inspection: PropertyConditionInspection): Promise<PcrPartnerUpsertResult> {
    return { ok: true, mode: 'manual', status: 'exported_manual' }
  }
}

/**
 * Placeholder for PropertyInspect / RedRabbit class partners.
 * Always refuse-closed — do not invent live HTTP paths or credentials.
 */
export class RefuseClosedPcrPartnerAdapter implements IPcrPartnerAdapter {
  readonly id: string
  readonly live = true
  readonly configured: boolean
  readonly partnerCode: PcrPartnerCode
  private readonly reason: string

  constructor(
    partnerCode: Extract<PcrPartnerCode, 'propertyinspect' | 'redrabbit'>,
    config: { configured?: boolean } = {},
  ) {
    this.partnerCode = partnerCode
    this.id = `partner_${partnerCode}`
    this.configured = Boolean(config.configured)
    const label = partnerCode === 'propertyinspect' ? 'PropertyInspect' : 'RedRabbit'
    this.reason = this.configured
      ? `${label} live API adapter is a placeholder. Partner credentials may be present but HTTP client is not implemented — use ManualPcrAdapter / in-app PCR pack. Official partner docs required (escalate to Michael).`
      : `${label} partner adapter is not configured. Mode A refuses live push — use in-app soft PCR pack. Do not invent partner keys or scrape.`
  }

  async pushInspection(_inspection: PropertyConditionInspection): Promise<PcrPartnerUpsertResult> {
    return {
      ok: false,
      mode: 'partner',
      status: 'error',
      error: this.reason,
    }
  }
}

export type PcrAdapterKind = 'manual' | 'partner_refuse'

/** Resolve Mode A adapter — default manual; partner always refuse-closed. */
export function pcrPartnerAdapterFromEnv(
  partnerCode: Extract<PcrPartnerCode, 'propertyinspect' | 'redrabbit'> = 'propertyinspect',
  env: Record<string, string | undefined> = {},
): IPcrPartnerAdapter {
  const kind = (
    env.PCR_ADAPTER ??
    env.VITE_PCR_ADAPTER ??
    'manual'
  ).toLowerCase()
  if (kind === 'partner' || kind === 'partner_refuse' || kind === partnerCode) {
    const keyPresent = Boolean(
      (env.PCR_PARTNER_API_KEY ?? env.VITE_PCR_PARTNER_API_KEY ?? '').trim(),
    )
    return new RefuseClosedPcrPartnerAdapter(partnerCode, { configured: keyPresent })
  }
  return new ManualPcrAdapter()
}

export function attemptLivePartnerPush(
  adapter: IPcrPartnerAdapter,
  inspection: PropertyConditionInspection,
): Promise<PcrPartnerUpsertResult> {
  return adapter.pushInspection(inspection)
}

export function assertPartnerNotLive(adapter: IPcrPartnerAdapter): void {
  if (adapter.live) {
    throw new PcrNotConfiguredError(
      `${adapter.partnerCode} live push is refuse-closed in Mode A — use ManualPcrAdapter.`,
    )
  }
}
