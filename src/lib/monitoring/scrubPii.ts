const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
const SA_PHONE_RE =
  /(?:\+27[\s-]?|0)(?:[1-8][\s-]?\d{2}[\s-]?\d{3}[\s-]?\d{4}|\d{2}[\s-]?\d{3}[\s-]?\d{4})/g
const SA_ID_RE = /\b\d{13}\b/g
const JWT_RE = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g
const SENSITIVE_PARAM_RE =
  /([?&#])(access_token|refresh_token|token|apikey|code|password)=([^&#\s]*)/gi

export function scrubText(s: string): string {
  return s
    .replace(EMAIL_RE, '[email]')
    .replace(SA_ID_RE, '[sa-id]')
    .replace(SA_PHONE_RE, '[phone]')
    .replace(JWT_RE, '[jwt]')
    .replace(SENSITIVE_PARAM_RE, '$1$2=[redacted]')
}

function scrubValue(value: unknown): unknown {
  if (typeof value === 'string') return scrubText(value)
  if (Array.isArray(value)) return value.map(scrubValue)
  if (value && typeof value === 'object') return scrubObject(value as Record<string, unknown>)
  return value
}

function scrubObject(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(obj)) {
    out[key] = scrubValue(val)
  }
  return out
}

function shouldDropHeader(key: string): boolean {
  const lower = key.toLowerCase()
  if (
    lower === 'authorization' ||
    lower === 'cookie' ||
    lower === 'set-cookie' ||
    lower === 'x-supabase-auth' ||
    lower === 'apikey'
  ) {
    return true
  }
  return lower.includes('token') || lower.includes('auth')
}

function scrubRequest(request: Record<string, unknown>): void {
  if ('cookies' in request) delete request.cookies
  const headers = request.headers
  if (headers && typeof headers === 'object' && !Array.isArray(headers)) {
    const next: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(headers as Record<string, unknown>)) {
      if (!shouldDropHeader(key)) next[key] = scrubValue(val)
    }
    request.headers = next
  }
  if (typeof request.url === 'string') request.url = scrubText(request.url)
  if (typeof request.query_string === 'string') {
    request.query_string = scrubText(request.query_string)
  }
  if (request.data !== undefined) request.data = scrubValue(request.data)
}

export function scrubEvent<T>(event: T): T {
  try {
    if (!event || typeof event !== 'object') return event
    const e = event as Record<string, unknown>

    if (typeof e.message === 'string') e.message = scrubText(e.message)

    const exceptions = e.exception as { values?: Array<{ value?: string; type?: string }> } | undefined
    if (exceptions?.values) {
      for (const ex of exceptions.values) {
        if (typeof ex.value === 'string') ex.value = scrubText(ex.value)
        if (typeof ex.type === 'string') ex.type = scrubText(ex.type)
      }
    }

    const breadcrumbs = e.breadcrumbs as
      | { values?: Array<Record<string, unknown>> }
      | undefined
    if (breadcrumbs?.values) {
      for (const b of breadcrumbs.values) {
        if (typeof b.message === 'string') b.message = scrubText(b.message)
        if (typeof b.url === 'string') b.url = scrubText(b.url)
        if (b.data !== undefined) b.data = scrubValue(b.data)
      }
    }

    const request = e.request as Record<string, unknown> | undefined
    if (request) scrubRequest(request)

    if (e.extra !== undefined) e.extra = scrubValue(e.extra)
    if (e.contexts !== undefined) e.contexts = scrubValue(e.contexts)
    if (e.tags !== undefined) e.tags = scrubValue(e.tags)

    const user = e.user as Record<string, unknown> | undefined
    if (user) {
      const id = user.id
      if (id !== undefined && id !== null && id !== '') {
        e.user = { id }
      } else {
        delete e.user
      }
    }

    return event
  } catch {
    return event
  }
}
