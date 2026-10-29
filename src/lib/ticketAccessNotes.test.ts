import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./api/config', () => ({
  isApiEnabled: false,
}))

describe('access-notes UI helper', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('unsupported: disabled with a "Not saved yet" hint', async () => {
    const { accessNotesFieldState } = await import('./ticketAccessNotes')
    expect(accessNotesFieldState(false)).toEqual({ disabled: true, hint: 'Not saved yet' })
  })
  it('supported: enabled, no hint', async () => {
    const { accessNotesFieldState } = await import('./ticketAccessNotes')
    expect(accessNotesFieldState(true)).toEqual({ disabled: false, hint: null })
  })
  it('bootstrap flag: only an explicit true counts', async () => {
    const { ticketAccessNotesSupportedFromBootstrap } = await import('./ticketAccessNotes')
    expect(ticketAccessNotesSupportedFromBootstrap({ ticketAccessNotesSupported: true })).toBe(true)
    expect(ticketAccessNotesSupportedFromBootstrap({ ticketAccessNotesSupported: false })).toBe(false)
    expect(ticketAccessNotesSupportedFromBootstrap({})).toBe(false)
  })
  it('store setter', async () => {
    const {
      getTicketAccessNotesSupported,
      setTicketAccessNotesSupported,
    } = await import('./ticketAccessNotes')
    setTicketAccessNotesSupported(false)
    expect(getTicketAccessNotesSupported()).toBe(false)
    setTicketAccessNotesSupported(true)
    expect(getTicketAccessNotesSupported()).toBe(true)
  })
})

describe('initial flag by mode', () => {
  it('API mode starts false until bootstrap lands', async () => {
    const { initialTicketAccessNotesSupported } = await import('./ticketAccessNotes')
    expect(initialTicketAccessNotesSupported({ apiEnabled: true })).toBe(false)
  })
  it('local / demo mode is true', async () => {
    const { initialTicketAccessNotesSupported } = await import('./ticketAccessNotes')
    expect(initialTicketAccessNotesSupported({ apiEnabled: false })).toBe(true)
  })
})
