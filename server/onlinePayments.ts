/**
 * Ruling 30: online PayFast checkout/ITN are switched off in code.
 * No env flag — turning this back on needs a review and a deploy.
 */
export const ONLINE_PAYMENTS_ENABLED = false as const

export const ONLINE_PAYMENTS_DISABLED_BODY = {
  ok: false as const,
  error: 'online_payments_disabled' as const,
  message:
    'Online payments are switched off. Pay your agency or landlord directly and they will record it.',
}

const ID_RE = /[^A-Za-z0-9_-]/g
const ID_MAX = 40
const LOG_CAP = 30
const WINDOW_MS = 60_000

function clipId(raw: unknown): string {
  if (raw == null) return ''
  return String(raw).replace(ID_RE, '').slice(0, ID_MAX)
}

type LogWindow = { start: number; count: number; summaryEmitted: boolean }
let logWindow: LogWindow = { start: 0, count: 0, summaryEmitted: false }

/** Test-only: reset the 30/min log window. */
export function resetPayfastDisabledLogForTests(): void {
  logWindow = { start: 0, count: 0, summaryEmitted: false }
}

function withinLogBudget(now: number): 'detail' | 'summary' | 'silent' {
  if (now - logWindow.start >= WINDOW_MS) {
    logWindow = { start: now, count: 0, summaryEmitted: false }
  }
  logWindow.count += 1
  if (logWindow.count <= LOG_CAP) return 'detail'
  if (!logWindow.summaryEmitted) {
    logWindow.summaryEmitted = true
    return 'summary'
  }
  return 'silent'
}

function isItnPath(path: string): boolean {
  return path === '/api/payfast/itn' || path.endsWith('/itn')
}

/**
 * Parse at most the allow-listed ITN id fields from a small body.
 * Only when Content-Length is present and ≤ 4096. Never returns signature/amounts/emails.
 */
async function readItnLogFields(
  c: { req: { header: (n: string) => string | undefined; text: () => Promise<string> } },
): Promise<{ m_payment_id: string; pf_payment_id: string; payment_status: string } | null> {
  const clRaw = c.req.header('content-length')
  if (clRaw == null || clRaw === '') return null
  const cl = Number(clRaw)
  if (!Number.isFinite(cl) || cl < 0 || cl > 4096) return null
  let text: string
  try {
    text = await c.req.text()
  } catch {
    return null
  }
  if (text.length > 4096) text = text.slice(0, 4096)
  const params = new URLSearchParams(text)
  return {
    m_payment_id: clipId(params.get('m_payment_id')),
    pf_payment_id: clipId(params.get('pf_payment_id')),
    payment_status: clipId(params.get('payment_status')),
  }
}

type HonoNext = () => Promise<void>
type HonoCtx = {
  req: {
    method: string
    path: string
    header: (n: string) => string | undefined
    text: () => Promise<string>
  }
  json: (body: unknown, status: number) => Response
}

/**
 * Gate every /api/payfast and /api/payfast/* hit with 410 before session/DB.
 * Mount AFTER CORS and BEFORE the /api/* session middleware.
 */
export async function onlinePaymentsDisabledGate(c: HonoCtx, next: HonoNext): Promise<Response | void> {
  if (ONLINE_PAYMENTS_ENABLED) return next()
  if (c.req.method === 'OPTIONS') return next()

  const path = c.req.path
  const method = c.req.method
  const now = Date.now()
  const budget = withinLogBudget(now)

  if (isItnPath(path)) {
    if (budget === 'detail') {
      const fields = await readItnLogFields(c)
      console.warn(
        'payfast_itn_disabled',
        method,
        fields?.m_payment_id || '-',
        fields?.pf_payment_id || '-',
        fields?.payment_status || '-',
      )
    } else if (budget === 'summary') {
      console.warn('payfast_disabled_rate_limited', logWindow.count)
    }
  } else if (budget === 'detail') {
    console.warn('payfast_disabled', path, method)
  } else if (budget === 'summary') {
    console.warn('payfast_disabled_rate_limited', logWindow.count)
  }

  return c.json(ONLINE_PAYMENTS_DISABLED_BODY, 410)
}
