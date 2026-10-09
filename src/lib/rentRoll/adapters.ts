/**
 * Remittance adapters (Mode A).
 * Manual soft export only; PayProp / bank-feed placeholders hard-refuse live remittance.
 */

import {
  REMITTANCE_REFUSE_COPY,
  RemittanceNotConfiguredError,
  type IRemittanceAdapter,
  type RemittancePartnerCode,
  type RemittancePushResult,
} from './types'

/** Soft pack / in-app export only — zero partner remittance credentials required. */
export class ManualSoftRemittanceAdapter implements IRemittanceAdapter {
  readonly id = 'manual_soft_remittance'
  readonly live = false
  readonly configured = true
  readonly partnerCode: RemittancePartnerCode = 'manual_soft'

  async pushLiveRemittance(): Promise<RemittancePushResult> {
    return { ok: true, mode: 'manual_soft', status: 'exported_soft' }
  }
}

/**
 * Placeholder for PayProp / bank-feed class remittance.
 * Always refuse-closed — do not invent live settlement HTTP.
 */
export class RefuseClosedRemittanceAdapter implements IRemittanceAdapter {
  readonly id: string
  readonly live = true
  readonly configured: boolean
  readonly partnerCode: RemittancePartnerCode
  private readonly reason: string

  constructor(
    partnerCode: Extract<RemittancePartnerCode, 'payprop' | 'bank_feed'>,
    config: { configured?: boolean } = {},
  ) {
    this.partnerCode = partnerCode
    this.id = `partner_${partnerCode}`
    this.configured = Boolean(config.configured)
    const label = partnerCode === 'payprop' ? 'PayProp' : 'Bank feed'
    this.reason = this.configured
      ? `${label} live remittance adapter is a placeholder. Partner credentials may be present but HTTP client is not implemented — use ManualSoftRemittanceAdapter / soft audit pack + in-app owner statements. ${REMITTANCE_REFUSE_COPY}`
      : `${label} remittance adapter is not configured. Live remittance is off — use the in-app rent roll / audit pack / owner statement. Do not invent partner remittance paths.`
  }

  async pushLiveRemittance(): Promise<RemittancePushResult> {
    return {
      ok: false,
      mode: 'partner',
      status: 'error',
      error: this.reason,
    }
  }
}

export type RemittanceAdapterKind = 'manual_soft' | 'partner_refuse'

/** Resolve Mode A adapter — default manual soft; partner always refuse-closed. */
export function remittanceAdapterFromEnv(
  partnerCode: Extract<RemittancePartnerCode, 'payprop' | 'bank_feed'> = 'payprop',
  env: Record<string, string | undefined> = {},
): IRemittanceAdapter {
  const kind = (
    env.REMITTANCE_ADAPTER ??
    env.VITE_REMITTANCE_ADAPTER ??
    'manual_soft'
  ).toLowerCase()
  if (kind === 'partner' || kind === 'partner_refuse' || kind === partnerCode || kind === 'payprop') {
    const keyPresent = Boolean(
      (env.REMITTANCE_PARTNER_API_KEY ?? env.VITE_REMITTANCE_PARTNER_API_KEY ?? '').trim(),
    )
    return new RefuseClosedRemittanceAdapter(partnerCode, { configured: keyPresent })
  }
  return new ManualSoftRemittanceAdapter()
}

export function attemptLiveRemittance(
  adapter: IRemittanceAdapter,
): Promise<RemittancePushResult> {
  return adapter.pushLiveRemittance()
}

export function assertRemittanceNotLive(adapter: IRemittanceAdapter): void {
  if (adapter.live) {
    throw new RemittanceNotConfiguredError(
      `${adapter.partnerCode} live remittance is off — use ManualSoftRemittanceAdapter.`,
    )
  }
}
