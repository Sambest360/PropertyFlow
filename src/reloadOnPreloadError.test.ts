// @vitest-environment happy-dom
// Kelly PR D R1 (Jim D-8): throwing sessionStorage must reload at most once.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'

function throwingStorage(): Storage {
  const boom = () => {
    throw new Error('sessionStorage blocked')
  }
  return {
    get length() {
      return 0
    },
    clear: boom,
    getItem: boom,
    key: boom,
    removeItem: boom,
    setItem: boom,
  } as Storage
}

describe('Kelly PR D R1 preloadError in-memory guard (D-8)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('main.tsx registers vite:preloadError and calls handleVitePreloadError', () => {
    const src = readFileSync(new URL('./main.tsx', import.meta.url), 'utf8')
    expect(src).toMatch(/addEventListener\(\s*['"]vite:preloadError['"]/)
    expect(src).toMatch(/handleVitePreloadError/)
  })

  it('reloads at most once when sessionStorage throws (mutant: catch still calls reload with no flag)', async () => {
    const { handleVitePreloadError, resetPreloadReloadGuardForTests } = await import('./reloadOnPreloadError')
    resetPreloadReloadGuardForTests()

    const reload = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { reload },
    })
    vi.stubGlobal('sessionStorage', throwingStorage())

    const event = { preventDefault: vi.fn() } as unknown as Event
    handleVitePreloadError(event)
    handleVitePreloadError(event)
    handleVitePreloadError(event)

    expect(reload).toHaveBeenCalledTimes(1)
    expect(event.preventDefault).toHaveBeenCalledTimes(1)
  })

  it('keeps the sessionStorage 60s window when storage works', async () => {
    const { handleVitePreloadError, resetPreloadReloadGuardForTests } = await import('./reloadOnPreloadError')
    resetPreloadReloadGuardForTests()

    const reload = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { reload },
    })
    const mem = new Map<string, string>()
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => {
        mem.set(k, v)
      },
      removeItem: (k: string) => {
        mem.delete(k)
      },
      clear: () => mem.clear(),
      key: () => null,
      get length() {
        return mem.size
      },
    } satisfies Storage)

    const event = { preventDefault: vi.fn() } as unknown as Event
    handleVitePreloadError(event)
    expect(reload).toHaveBeenCalledTimes(1)

    resetPreloadReloadGuardForTests()
    handleVitePreloadError(event)
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
