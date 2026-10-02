/**
 * Refuse-closed adapters — live CPA delivery + live CPI HTTP.
 * Mode A never invents success.
 */

import {
  CPA_DELIVERY_REFUSE_COPY,
  CPI_REFUSE_COPY,
  CpaDeliveryNotConfiguredError,
  CpiHttpNotConfiguredError,
} from './types'

export type CpaDeliveryChannel = 'whatsapp' | 'sms' | 'email_cpa' | 'registered_post'

export type CpaDeliveryAttempt = {
  ok: false
  refused: true
  channel: CpaDeliveryChannel
  reason: string
}

export type CpiFetchAttempt = {
  ok: false
  refused: true
  reason: string
}

/** Live CPA / WhatsApp / SMS / email statutory notice — refuse-closed. */
export function attemptLiveCpaDelivery(channel: CpaDeliveryChannel): CpaDeliveryAttempt {
  return {
    ok: false,
    refused: true,
    channel,
    reason: CPA_DELIVERY_REFUSE_COPY,
  }
}

export function assertCpaDeliveryNotLive(): never {
  throw new CpaDeliveryNotConfiguredError()
}

/** Live CPI HTTP — refuse-closed (staff-set % only). */
export function attemptLiveCpiFetch(): CpiFetchAttempt {
  return {
    ok: false,
    refused: true,
    reason: CPI_REFUSE_COPY,
  }
}

export function assertCpiNotLive(): never {
  throw new CpiHttpNotConfiguredError()
}
