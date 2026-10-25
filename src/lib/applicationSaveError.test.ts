import { describe, expect, it } from 'vitest'
import { APPLICATION_SAVE_FALLBACK, applicationSaveMessage } from './applicationSaveError'

describe('applicationSaveMessage', () => {
  it('explains a viewing-required refusal', () => {
    expect(applicationSaveMessage('Book and attend a viewing before applying for this unit')).toMatch(/book and attend a viewing/i)
  })
  it('passes short server reasons through and falls back otherwise', () => {
    expect(applicationSaveMessage('You already have an application for this home.')).toBe('You already have an application for this home.')
    expect(applicationSaveMessage('')).toBe(APPLICATION_SAVE_FALLBACK)
    expect(applicationSaveMessage('x'.repeat(300))).toBe(APPLICATION_SAVE_FALLBACK)
  })
})
