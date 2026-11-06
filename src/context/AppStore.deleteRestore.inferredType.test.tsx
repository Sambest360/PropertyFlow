// @vitest-environment happy-dom
/**
 * #144: deleteProperty and restoreProperty save the listing through
 * propertyPersistPayload, so an older listing whose type was only inferred
 * (no stored type; the app guessed one) never sends that guess to the server
 * as if someone had chosen it. Drives the real AppStoreProvider and the real
 * persist client; only the write gate, the API flag and fetch are stubbed.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/api/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/api/config')>()),
  isApiEnabled: true,
}))
vi.mock('../lib/auth/writeGate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/auth/writeGate')>()),
  canPersistWrites: () => true,
  assertCanPersistWrites: () => true,
}))

import { AppStoreProvider, useStore } from './AppStore'
import { AUTH_USER_STORAGE_KEY } from '../lib/clientCache'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type Store = ReturnType<typeof useStore>
type PersistBody = { resource?: string; action?: string; id?: string; data?: Record<string, unknown> }

const persistBodies: PersistBody[] = []
let root: Root | null = null
let host: HTMLElement | null = null
let store: Store | null = null

function fakeResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => body,
    text: async () => JSON.stringify(body),
    clone() {
      return fakeResponse(status, body)
    },
  } as unknown as Response
}

beforeEach(() => {
  persistBodies.length = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).includes('/api/persist')) {
        persistBodies.push(init?.body ? (JSON.parse(String(init.body)) as PersistBody) : {})
      }
      return fakeResponse(200, { ok: true })
    }),
  )
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  store = null
  try {
    localStorage.removeItem(AUTH_USER_STORAGE_KEY)
  } catch {
    /* ignore */
  }
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function settle() {
  for (let i = 0; i < 10; i++) await act(async () => { await new Promise((r) => setTimeout(r, 5)) })
}

function Capture() {
  store = useStore()
  return null
}

/** An agency admin signed in, and an older listing whose type was only inferred. */
async function mountWithInferredListing(): Promise<string> {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => root!.render(<AppStoreProvider><Capture /></AppStoreProvider>))
  await settle()
  await act(async () => {
    const admin = store!.createUser({
      name: 'Agency Admin',
      email: 'admin@agency.test',
      role: 'agent_admin',
      agencyId: 'ag-144',
      password: 'not-used-in-test',
    } as unknown as Parameters<Store['createUser']>[0])
    localStorage.setItem(AUTH_USER_STORAGE_KEY, admin.id)
  })
  let id = ''
  await act(async () => {
    const p = store!.createProperty({
      agencyId: 'ag-144',
      landlordId: null,
      agentId: null,
      unitId: null,
      title: 'Older listing 12',
      // Not stored on the server: the bootstrap guessed it from the bedrooms.
      type: 'Apartment',
      typeInferred: true,
      status: 'Published',
      listingMode: 'rent',
      rent: 9000,
      price: null,
      city: 'Gqeberha',
      suburb: 'Walmer',
      beds: 2,
      baths: 1,
      parking: 1,
      area: 70,
      amenities: [],
      featured: false,
    } as unknown as Parameters<Store['createProperty']>[0])
    id = p.id
  })
  await settle()
  persistBodies.length = 0
  return id
}

const propertySaves = (id: string) =>
  persistBodies.filter((b) => b.resource === 'property' && b.action === 'upsert' && b.id === id)

describe('#144: delete / restore never send an inferred property type', () => {
  it('deleteProperty saves the listing without the guessed type', async () => {
    const id = await mountWithInferredListing()
    let result: Awaited<ReturnType<Store['deleteProperty']>> | null = null
    await act(async () => {
      result = await store!.deleteProperty(id)
    })
    expect(result).toMatchObject({ ok: true })
    const saves = propertySaves(id)
    expect(saves).toHaveLength(1)
    const data = saves[0].data ?? {}
    expect(data).not.toHaveProperty('type')
    expect(data).not.toHaveProperty('typeInferred')
    // The delete itself still goes out.
    expect(data).toMatchObject({ id, status: 'Archived', statusKey: 'DELETED', featured: false })
    expect(typeof data.deletedAt).toBe('string')
  })

  it('restoreProperty saves the listing without the guessed type', async () => {
    const id = await mountWithInferredListing()
    await act(async () => {
      await store!.deleteProperty(id)
    })
    await settle()
    persistBodies.length = 0
    let result: Awaited<ReturnType<Store['restoreProperty']>> | null = null
    await act(async () => {
      result = await store!.restoreProperty(id)
    })
    expect(result).toMatchObject({ ok: true })
    const saves = propertySaves(id)
    expect(saves).toHaveLength(1)
    const data = saves[0].data ?? {}
    expect(data).not.toHaveProperty('type')
    expect(data).not.toHaveProperty('typeInferred')
    expect(data).toMatchObject({ id, restore: true, deletedAt: null, status: 'Draft', statusKey: 'DRAFT' })
  })
})
