import { EventEmitter } from 'node:events'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import {
  buildWebRequest,
  createVercelNodeHandler,
  isWebRequestInvocation,
  writeWebResponse,
} from './vercelNodeBridge.js'

function mockIncoming(opts: {
  method?: string
  url?: string
  headers?: Record<string, string | string[] | undefined>
  body?: Buffer
}): IncomingMessage {
  const ee = new EventEmitter() as IncomingMessage & EventEmitter
  ee.method = opts.method || 'GET'
  ee.url = opts.url || '/api/health'
  ee.headers = { host: 'property-flow-jet.vercel.app', ...(opts.headers || {}) }
  const body = opts.body
  ;(ee as unknown as { [Symbol.asyncIterator]: () => AsyncIterator<Buffer> })[
    Symbol.asyncIterator
  ] = async function* () {
    if (body && body.length) yield body
  }
  return ee
}

function mockOutgoing(): ServerResponse & {
  body: Buffer
  headers: Record<string, unknown>
} {
  const headers: Record<string, unknown> = {}
  const chunks: Buffer[] = []
  const res = {
    statusCode: 200,
    headersSent: false,
    headers,
    body: Buffer.alloc(0),
    setHeader(key: string, value: unknown) {
      headers[key.toLowerCase()] = value
    },
    end(chunk?: Buffer | string) {
      if (chunk !== undefined) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
      }
      this.body = Buffer.concat(chunks)
      this.headersSent = true
    },
  }
  return res as unknown as ServerResponse & {
    body: Buffer
    headers: Record<string, unknown>
  }
}

describe('vercelNodeBridge', () => {
  it('detects Web Request invocation vs Node (req, res)', () => {
    const web = new Request('https://example.com/api/health')
    expect(isWebRequestInvocation(web)).toBe(true)
    const nodeReq = mockIncoming({})
    const nodeRes = mockOutgoing()
    expect(isWebRequestInvocation(nodeReq, nodeRes)).toBe(false)
  })

  it('buildWebRequest uses x-forwarded-proto and path', () => {
    const req = mockIncoming({
      url: '/api/health?db=0',
      headers: {
        host: 'example.com',
        'x-forwarded-proto': 'https',
      },
    })
    const web = buildWebRequest(req, undefined)
    expect(web.url).toBe('https://example.com/api/health?db=0')
    expect(web.method).toBe('GET')
  })

  it('Node handler writes status/body (does not rely on returned Response)', async () => {
    const fetch = vi.fn(async () =>
      Response.json({ ok: true, database: 'configured' }, { status: 200 }),
    )
    const handler = createVercelNodeHandler(fetch)
    const req = mockIncoming({ url: '/api/health?db=0' })
    const res = mockOutgoing()
    const returned = await handler(req, res)
    expect(returned).toBeUndefined()
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body.toString())).toEqual({
      ok: true,
      database: 'configured',
    })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('Node handler buffers POST body into Web Request', async () => {
    const payload = Buffer.from(JSON.stringify({ email: 'a@b.co' }))
    let seenBody = ''
    const handler = createVercelNodeHandler(async (request) => {
      seenBody = await request.text()
      return Response.json({ ok: true }, { status: 201 })
    })
    const req = mockIncoming({
      method: 'POST',
      url: '/api/auth/register-supabase',
      headers: { 'content-type': 'application/json', host: 'example.com' },
      body: payload,
    })
    const res = mockOutgoing()
    await handler(req, res)
    expect(res.statusCode).toBe(201)
    expect(seenBody).toBe(payload.toString())
  })

  it('preserves multiple Set-Cookie headers', async () => {
    const response = new Response('ok', { status: 200 })
    response.headers.append('set-cookie', 'a=1; Path=/')
    response.headers.append('set-cookie', 'b=2; Path=/')
    const res = mockOutgoing()
    await writeWebResponse(res, response)
    expect(res.headers['set-cookie']).toEqual(['a=1; Path=/', 'b=2; Path=/'])
  })

  it('Web-style invocation returns Response directly', async () => {
    const handler = createVercelNodeHandler(async () =>
      Response.json({ ok: true }, { status: 200 }),
    )
    const out = await handler(new Request('https://example.com/api/health'))
    expect(out).toBeInstanceOf(Response)
    expect(out?.status).toBe(200)
  })
})
