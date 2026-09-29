import { describe, expect, it } from 'vitest'
import {
  applicationScreeningRow,
  buildScreeningDraft,
  notesWithoutScreening,
} from './applicationScreening'

describe('application screening', () => {
  it('removes ID and income lines from notes', () => {
    const notes = notesWithoutScreening(
      'Please call after 5.\nMonthly income: 12000\nID/Passport: 9001015009086\nID number: 123',
    )
    expect(notes).toBe('Please call after 5.')
    expect(notes).not.toMatch(/income|passport|id number/i)
  })

  it('builds a screening row and does not put ID or income into notes', () => {
    const draft = buildScreeningDraft('9001015009086', 'R12 345,67')
    expect(draft.ok).toBe(true)
    if (!draft.ok) return
    const row = applicationScreeningRow('app-uuid', {
      idType: draft.idType,
      idNumberOrPassport: draft.idNumber,
      grossMonthlyIncomeCents: draft.grossMonthlyIncomeCents,
      notes: `Monthly income: ${draft.incomeRands}\nID/Passport: ${draft.idNumber}`,
    })
    expect(row).toEqual({
      application_id: 'app-uuid',
      id_type: 'sa_id',
      id_number: '9001015009086',
      gross_monthly_income_cents: 1234567,
    })
    expect(Object.keys(row ?? {}).sort()).toEqual([
      'application_id',
      'gross_monthly_income_cents',
      'id_number',
      'id_type',
    ])
    expect(notesWithoutScreening(`Monthly income: 12345\nID/Passport: ${draft.idNumber}`)).toBe('')
  })

  it('accepts a passport and rejects blank, negative, and non-numeric income', () => {
    const passport = buildScreeningDraft('A1234567', '8 500')
    expect(passport).toMatchObject({
      ok: true,
      idType: 'passport',
      idNumber: 'A1234567',
      grossMonthlyIncomeCents: 850000,
    })

    expect(buildScreeningDraft('', '100')).toMatchObject({ ok: false, idMessage: expect.any(String) })
    expect(buildScreeningDraft('A1234567', '')).toMatchObject({
      ok: false,
      incomeMessage: expect.stringMatching(/income/i),
    })
    expect(buildScreeningDraft('A1234567', '-50').ok).toBe(false)
    expect(buildScreeningDraft('A1234567', 'nope').ok).toBe(false)

    const rejected = buildScreeningDraft('A1234567', 'abc')
    expect(rejected.ok).toBe(false)
    if (!rejected.ok) expect(rejected).not.toHaveProperty('grossMonthlyIncomeCents', 0)
  })

  it('does not invent a screening row from notes or a zero default', () => {
    expect(
      applicationScreeningRow('app-uuid', {
        notes: 'ID/Passport: 9001015009086\nMonthly income: 0',
        income: 0,
      }),
    ).toBeNull()
  })
})
