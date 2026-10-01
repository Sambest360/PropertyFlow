/**
 * Bridge Hono's Web `Request`/`Response` to Vercel Node `(req, res)` handlers.
 *
 * Why this exists:
 * - `hono/vercel`'s `handle(app)` returns `(req) => app.fetch(req)` — a function
 *   that *returns* a Web `Response`. On Vite + `/api` projects Vercel treats the
 *   default export as a classic Node `(req, res) => void` handler and ignores that
 *   return value → FUNCTION_INVOCATION_TIMEOUT (~30s, empty body) on every route,
 *   including `/api/health?db=0` which never touches Postgres.
 * - `@hono/node-server`'s listener can miss POST bodies on Vercel (stream already
 *   flowing). We drain the Node body into a Buffer first, then build a Web Request.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'

export type FetchLike = (request: Request) => Response | Promise<Response>

const BODYLESS = new Set(['GET', 'HEAD'])

export function isWebRequestInvocation(
  req: IncomingMessage | Request,
  res?: ServerResponse,
): req is Request {
  return (
    typeof (req as Request).arrayBuffer === 'function' &&
    typeof (res as ServerResponse | undefined)?.setHeader !== 'function'
  )
}

export async function readIncomingBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks)
}

export function buildWebRequest(
  req: IncomingMessage,
  body: Buffer | undefined,
): Request {
  const host = req.headers.host || 'localhost'
  const protoHeader = req.headers['x-forwarded-proto']
  const proto =
    (Array.isArray(protoHeader) ? protoHeader[0] : protoHeader)?.split(',')[0]?.trim() ||
    'https'
  const url = `${proto}://${host}${req.url || '/'}`
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item)
    } else {
      headers.set(key, value)
    }
  }

  const method = req.method || 'GET'
  const init: RequestInit & { duplex?: 'half' } = { method, headers }
  if (body && body.length > 0 && !BODYLESS.has(method.toUpperCase())) {
    init.body = new Uint8Array(body)
    init.duplex = 'half'
  }
  return new Request(url, init)
}

export async function writeWebResponse(
  res: ServerResponse,
  response: Response,
): Promise<void> {
  res.statusCode = response.status
  const setCookies =
    typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : []
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') return
    res.setHeader(key, value)
  })
  if (setCookies.length > 0) {
    res.setHeader('set-cookie', setCookies)
  }
  const ab = await response.arrayBuffer()
  res.end(Buffer.from(ab))
}

/**
 * Vercel Node default export: always writes to `res` (never relies on a returned
 * `Response`). Dual-mode: if invoked Web-style with a single `Request`, returns
 * the Web `Response` directly.
 */
export function createVercelNodeHandler(fetch: FetchLike) {
  return async function vercelNodeHandler(
    req: IncomingMessage | Request,
    res?: ServerResponse,
  ): Promise<Response | void> {
    if (isWebRequestInvocation(req, res)) {
      return fetch(req)
    }

    const nodeReq = req as IncomingMessage
    const nodeRes = res as ServerResponse
    const method = (nodeReq.method || 'GET').toUpperCase()

    try {
      const body = BODYLESS.has(method) ? undefined : await readIncomingBody(nodeReq)
      const webReq = buildWebRequest(nodeReq, body)
      const response = await fetch(webReq)
      await writeWebResponse(nodeRes, response)
    } catch (err) {
      if (!nodeRes.headersSent) {
        nodeRes.statusCode = 500
        nodeRes.setHeader('content-type', 'application/json; charset=utf-8')
        const message = err instanceof Error ? err.message : String(err)
        nodeRes.end(JSON.stringify({ ok: false, error: message }))
      }
    }
  }
}
