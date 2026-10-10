import { describe, expect, it } from 'vitest'
import {
  accessNotesFieldState,
  getTicketAccessNotesSupported,
  setTicketAccessNotesSupported,
  ticketAccessNotesSupportedFromBootstrap,
} from './ticketAccessNotes'

describe('access-notes UI helper', () => {
  it('unsupported: disabled with a "Not saved yet" hint', () => {
    expect(accessNotesFieldState(false)).toEqual({ disabled: true, hint: 'Not saved yet' })
  })
  it('supported: enabled, no hint', () => {
    expect(accessNotesFieldState(true)).toEqual({ disabled: false, hint: null })
  })
  it('bootstrap flag: only an explicit true counts', () => {
    expect(ticketAccessNotesSupportedFromBootstrap({ ticketAccessNotesSupported: true })).toBe(true)
    expect(ticketAccessNotesSupportedFromBootstrap({ ticketAccessNotesSupported: false })).toBe(false)
    expect(ticketAccessNotesSupportedFromBootstrap({})).toBe(false)
  })
  it('store setter', () => {
    setTicketAccessNotesSupported(false)
    expect(getTicketAccessNotesSupported()).toBe(false)
    setTicketAccessNotesSupported(true)
    expect(getTicketAccessNotesSupported()).toBe(true)
  })
})
