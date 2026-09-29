/**
 * Browser-side PayFast checkout launcher.
 *
 * Signed fields come only from `POST /api/payfast/create`. The merchant id,
 * merchant key, and passphrase are never in frontend code. In Supabase-direct
 * mode the payments API is off unless `VITE_ENABLE_API` is explicitly set, and
 * the pay button stays unavailable.
 */

import { isApiEnabled, isSupabaseMode } from '../api/config'
import { authHeaders } from '../api/authClient'

export type PayfastCheckoutOptions = {
  /** Override amount (integer cents). The server uses the ledger amount. */
  amountCents?: number
  /** Override item name. Defaults to "PropertyFlow · {type} · {party}". */
  itemName?: string
  payer?: { firstName?: string; lastName?: string; email?: string }
  /** Recurring billing (subscription_type=1). */
  subscription?: { cycles: string; frequency: 3 | 4 | 5 | 6 | 7 }
}

export type PayfastCheckoutResult = {
  ok: boolean
  /** Machine-readable error key (e.g. payment_already_paid). */
  error?: string
  /** Human-readable message safe to show in the UI. */
  userMessage?: string
}

export const PAYFAST_UNAVAILABLE_MESSAGE =
  'Online payments are unavailable while the payments API is off. Pay by EFT and share the reference with your agency.'

const USER_MESSAGES: Record<string, string> = {
  payfast_unavailable: PAYFAST_UNAVAILABLE_MESSAGE,
  payfast_not_configured: 'Online payments are not configured yet. Please pay via EFT.',
  payment_not_found: 'This payment could not be found on the ledger.',
  payment_already_paid: 'This payment has already been settled.',
  payment_cancelled: 'This payment was cancelled. Please contact your agency.',
}

/**
 * Supabase-direct mode talks to Supabase from the browser. Card checkout needs
 * the Hono API, which is on only when `VITE_ENABLE_API` is explicitly enabled
 * in that mode (or when the app is running in API mode).
 */
export function isPayfastCheckoutAvailable(): boolean {
  if (isSupabaseMode) {
    const flag = import.meta.env.VITE_ENABLE_API
    return flag === '1' || flag === 'true'
  }
  return isApiEnabled
}

export async function startPayfastCheckout(
  paymentId: string,
  opts: PayfastCheckoutOptions = {},
): Promise<PayfastCheckoutResult> {
  if (!isPayfastCheckoutAvailable()) {
    return {
      ok: false,
      error: 'payfast_unavailable',
      userMessage: PAYFAST_UNAVAILABLE_MESSAGE,
    }
  }
  try {
    const res = await fetch('/api/payfast/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(await authHeaders()),
      },
      credentials: 'include',
      body: JSON.stringify({ paymentId, ...opts }),
    })
    const data = (await res.json().catch(() => null)) as
      | { ok?: boolean; error?: string; processUrl?: string; fields?: Record<string, string> }
      | null
    if (!res.ok || !data?.ok || !data.processUrl || !data.fields) {
      const error = data?.error ?? `HTTP ${res.status}`
      return {
        ok: false,
        error,
        userMessage:
          USER_MESSAGES[error] ??
          'We could not start the PayFast checkout. Please try again or pay via EFT.',
      }
    }
    const form = document.createElement('form')
    form.method = 'POST'
    form.action = data.processUrl
    form.style.display = 'none'
    for (const [name, value] of Object.entries(data.fields)) {
      const input = document.createElement('input')
      input.type = 'hidden'
      input.name = name
      input.value = value
      form.appendChild(input)
    }
    document.body.appendChild(form)
    form.submit()
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      userMessage: 'We could not reach the payment server. Check your connection and try again.',
    }
  }
}
