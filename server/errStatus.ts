import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { captureServerError } from './sentry.js'

export function errStatus(err: unknown): ContentfulStatusCode {
  let status: ContentfulStatusCode = 500
  if (err && typeof err === 'object' && 'status' in err) {
    const s = Number((err as { status: unknown }).status)
    if (s >= 400 && s < 600) status = s as ContentfulStatusCode
  }
  if (status >= 500) {
    captureServerError(err, { status })
  }
  return status
}
