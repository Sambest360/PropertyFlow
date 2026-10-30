/**
 * F1: PayFast ITN server-to-server confirmation — SERVER ONLY.
 *
 * PayFast developer docs, Custom Integration, step 4.3 "Perform a server
 * request to confirm the details" (read 30 Oct 2026):
 *   - POST, application/x-www-form-urlencoded, to
 *       live    https://www.payfast.co.za/eng/query/validate
 *       sandbox https://sandbox.payfast.co.za/eng/query/validate
 *   - body: the posted ITN fields as `key=urlencode(value)` joined by `&`,
 *     in the order received, without `signature` (PHP sample: $pfParamString)
 *   - success only when the reply is exactly `VALID`.
 *
 * Why: with no PAYFAST_PASSPHRASE the ITN signature is an unsalted MD5 that
 * anyone can compute, so the signature alone cannot prove PayFast sent the
 * ITN. Only PayFast's own answer can. This check fails closed: INVALID, a
 * network error, a timeout, a redirect, a non-200 or any other reply body
 * all reject. One request per ITN, no retry loop: PayFast re-sends an ITN
 * that did not get a 200, which is the retry.
 *
 * Nothing here logs. Reasons are fixed strings with no reply text, no
 * signature and no ITN values, so callers can log them safely.
 */
import { PAYFAST_PROCESS_URL, type PayfastConfig } from './payfast.js'

export const PAYFAST_VALIDATE_LIVE_URL = 'https://www.payfast.co.za/eng/query/validate'
export const PAYFAST_VALIDATE_SANDBOX_URL = 'https://sandbox.payfast.co.za/eng/query/validate'

/** Short: PayFast waits on our reply while we wait on theirs. */
export const PAYFAST_VALIDATE_TIMEOUT_MS = 8000

/** Longest reply we bother reading; PayFast's is 5 or 7 bytes. */
const MAX_REPLY_CHARS = 64

/**
 * Live means the live process URL (PAYFAST_MODE=live); anything else,
 * including unset, is sandbox. Same rule as H1's payfastIsLive.
 */
export function payfastValidateUrl(config: PayfastConfig): string {
  const live = Boolean(config.processUrl) && config.processUrl !== PAYFAST_PROCESS_URL
  return live ? PAYFAST_VALIDATE_LIVE_URL : PAYFAST_VALIDATE_SANDBOX_URL
}

/** PHP urlencode, byte-wise over UTF-8, WITHOUT trimming (PayFast compares exact data). */
function phpUrlencode(value: string): string {
  let out = ''
  for (const b of Buffer.from(value, 'utf8')) {
    const c = String.fromCharCode(b)
    if (/[A-Za-z0-9\-_.]/.test(c)) out += c
    else if (c === ' ') out += '+'
    else out += '%' + b.toString(16).toUpperCase().padStart(2, '0')
  }
  return out
}

/**
 * Every received field except `signature`, in received order, empty values
 * kept. Unlike PayFast's PHP sample this does not stop at `signature`: any
 * field after it is sent too, so PayFast (not us) decides whether it is real.
 */
export function validateParamString(body: Record<string, string>): string {
  return Object.keys(body)
    .filter((k) => k !== 'signature')
    .map((k) => `${k}=${phpUrlencode(String(body[k] ?? ''))}`)
    .join('&')
}

export type ValidateVerdict =
  | { ok: true }
  /** retryable: answer non-200 so PayFast re-sends (our side or theirs may be down). */
  | { ok: false; retryable: boolean; reason: string }

export type ValidateDeps = { fetch?: typeof fetch; timeoutMs?: number }

export async function confirmItnWithPayfast(
  body: Record<string, string>,
  config: PayfastConfig,
  deps: ValidateDeps = {},
): Promise<ValidateVerdict> {
  const doFetch = deps.fetch ?? globalThis.fetch
  const timeoutMs = deps.timeoutMs ?? PAYFAST_VALIDATE_TIMEOUT_MS
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timedOut = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => {
      controller.abort()
      resolve('timeout')
    }, timeoutMs)
  })
  const timeoutVerdict: ValidateVerdict = { ok: false, retryable: true, reason: `PayFast validate timed out after ${timeoutMs} ms` }
  try {
    const request = (async (): Promise<ValidateVerdict> => {
      let res: Response
      try {
        res = await doFetch(payfastValidateUrl(config), {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: validateParamString(body),
          redirect: 'error',
          signal: controller.signal,
        })
      } catch {
        if (controller.signal.aborted) return timeoutVerdict
        return { ok: false, retryable: true, reason: 'PayFast validate request failed' }
      }
      if (res.status !== 200) {
        return { ok: false, retryable: true, reason: `PayFast validate answered HTTP ${res.status}` }
      }
      let text: string
      try {
        text = await res.text()
      } catch {
        if (controller.signal.aborted) return timeoutVerdict
        return { ok: false, retryable: true, reason: 'PayFast validate request failed' }
      }
      const reply = text.length > MAX_REPLY_CHARS ? '' : text.trim()
      if (reply === 'VALID') return { ok: true }
      if (reply === 'INVALID') return { ok: false, retryable: false, reason: 'PayFast validate replied INVALID' }
      return { ok: false, retryable: true, reason: 'PayFast validate reply was not VALID or INVALID' }
    })()
    const winner = await Promise.race([request, timedOut])
    return winner === 'timeout' ? timeoutVerdict : winner
  } finally {
    clearTimeout(timer)
  }
}
