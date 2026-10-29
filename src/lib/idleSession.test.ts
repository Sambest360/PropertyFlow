import { describe, expect, it } from 'vitest'
import { IDLE_WARNING_MS, idlePhase } from './idleSession'

describe('idlePhase', () => {
  const T = 30 * 60_000
  it('is active right after activity', () => {
    expect(idlePhase(0, 1_000, T).phase).toBe('active')
  })
  it('warns in the last minute', () => {
    expect(idlePhase(0, T - IDLE_WARNING_MS + 1, T).phase).toBe('warning')
  })
  it('expires after the timeout', () => {
    expect(idlePhase(0, T, T).phase).toBe('expired')
  })
})
