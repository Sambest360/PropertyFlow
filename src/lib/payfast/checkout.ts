/**
 * Browser-side PayFast checkout launcher.
 *
 * Fetches signed fields from `POST /api/payfast/create` (the passphrase never
 * touches the browser) and auto-submits a form to PayFast's hosted process
 * page. PayFast redirects back to `/payfast/return` or `/payfast/cancel` and
 * notifies our server via ITN, which marks the ledger payment PAID.
 */

export type PayfastCheckoutOptions = {
  /** Override amount (integer cents). Defaults to the ledger amount. */
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

const USER_MESSAGES: Record<string, string> = {
  payfast_not_configured: 'Online payments are not configured yet. Please pay via EFT.',
  payment_not_found: 'This payment could not be found on the ledger.',
  payment_already_paid: 'This payment is already marked paid.',
  payment_cancelled: 'This payment was cancelled. Please contact your agency.',
}

export async function startPayfastCheckout(
  paymentId: string,
  opts: PayfastCheckoutOptions = {},
): Promise<PayfastCheckoutResult> {
  try {
    const res = await fetch('/api/payfast/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
