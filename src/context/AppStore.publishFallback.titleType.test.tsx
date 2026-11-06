// @vitest-environment happy-dom
/**
 * AV3-13 behavioural: drive publishProperty's FALLBACK persist
 * (AppStore.tsx ~:4053–:4087, persistUpsert('unit', targetUnitId, …)).
 *
 * computeUnitPatchForPropertyStatus returns null when the unit is not in
 * stateRef (src/lib/marketplaceVisibility.ts, `if (!unit) return null`).
 * publishProperty then takes the else-if branch that stamps the unit by
 * targetUnitId — the same-tick create path where the wizard passes `created`
 * before React has the unit in state (comment at AppStore.tsx ~:4054).
 *
 * No src changes: the real publishProperty / persistUpsert / persistToApiDetailed
 * stack runs; only the write gate, API flag, and fetch are stubbed.
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
import { titleTypeWarning } from '../lib/listingSizes'
import type { PropertyAsset } from '../types/domain'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type Store = ReturnType<typeof useStore>
type PersistBody = {
  resource?: string
  action?: string
  id?: string
  data?: Record<string, unknown>
}

const PROPERTY_ID = 'unt-kelly-av313-fallback-d2'
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

function gardenFlatMismatch(): PropertyAsset {
  return {
    id: PROPERTY_ID,
    agencyId: 'ag-kelly-av313',
    landlordId: 'u-landlord-av313',
    agentId: 'u-agent-av313',
    buildingId: 'bld-av313',
    unitId: PROPERTY_ID,
    title: 'Garden flat behind main house',
    type: 'Apartment',
    status: 'Draft',
    listingMode: 'rent',
    rent: 8500,
    price: null,
    beds: 1,
    baths: 1,
    parking: 0,
    area: 42,
    city: 'Gqeberha',
    suburb: 'Walmer',
    address: '1 Seventh Avenue, Walmer',
    lat: -33.97,
    lng: 25.6,
    images: [],
    rooms: [],
    amenities: [],
    description: '',
    featured: false,
    createdAt: '2026-11-06',
  }
}

function unitFallbackPersists(): PersistBody[] {
  return persistBodies.filter(
    (op) => op.resource === 'unit' && op.action === 'upsert' && op.id === PROPERTY_ID,
  )
}

beforeEach(() => {
  persistBodies.length = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url)
      if (u.includes('/api/persist')) {
        const body = init?.body ? (JSON.parse(String(init.body)) as PersistBody) : {}
        persistBodies.push(body)
        return fakeResponse(200, { ok: true })
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
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function settle() {
  for (let i = 0; i < 10; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5))
    })
  }
}

function Capture() {
  store = useStore()
  return null
}

async function mountStore(): Promise<Store> {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => root!.render(<AppStoreProvider><Capture /></AppStoreProvider>))
  await settle()
  if (!store) throw new Error('store not captured')
  persistBodies.length = 0
  return store
}

describe('AV3-13 behavioural: publishProperty fallback unit persist', () => {
  it("fallback persistUpsert('unit', targetUnitId) carries titleTypeConfirmed: true for a confirmed title/type mismatch", async () => {
    const created = gardenFlatMismatch()
    expect(titleTypeWarning(created.title, created.type)).toMatch(/house/i)
    expect(created.unitId).toBe(created.id)

    const s = await mountStore()
    expect(s.state.units.find((u) => u.id === created.id)).toBeUndefined()

    let published = false
    await act(async () => {
      published = await s.publishProperty(created.id, 'Published', created, { titleTypeConfirmed: true })
    })
    expect(published).toBe(true)

    const unitOps = unitFallbackPersists()
    expect(unitOps.length).toBeGreaterThan(0)
    const payload = unitOps[0]?.data ?? {}
    expect(payload.titleTypeConfirmed).toBe(true)
    expect(payload.id).toBe(PROPERTY_ID)
    // unitPatch is null on this path, so nextUnitStatus is 'DRAFT'
    // (AppStore.tsx ~:3995: `unitPatch?.statusKey ?? 'DRAFT'`). That is
    // existing runtime behaviour, not something this test should change.
    expect(payload.statusKey).toBe('DRAFT')
    // Synthetic fallback payload (unit missing from stateRef), not unitPersistPayload.
    expect(payload.unitNumber).toBe(PROPERTY_ID.replace(/^unt-/, '') || 'MAIN')
  })

  it("fallback persistUpsert('unit', targetUnitId) does not carry titleTypeConfirmed: true without a confirm", async () => {
    const created = gardenFlatMismatch()
    expect(titleTypeWarning(created.title, created.type)).toMatch(/house/i)

    const s = await mountStore()
    expect(s.state.units.find((u) => u.id === created.id)).toBeUndefined()

    await act(async () => {
      await s.publishProperty(created.id, 'Published', created)
    })

    const unitOps = unitFallbackPersists()
    expect(unitOps.length).toBeGreaterThan(0)
    expect(unitOps[0]?.data?.titleTypeConfirmed).not.toBe(true)
  })
})
