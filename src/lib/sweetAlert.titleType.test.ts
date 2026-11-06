import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const src = readFileSync(new URL('./sweetAlert.ts', import.meta.url), 'utf8')

describe('T6-ui: title/type publish dialog', () => {
  it('defines sweetTitleTypeConfirm with Change type as the default-focus button and Publish anyway as the second', () => {
    expect(src).toContain('export async function sweetTitleTypeConfirm')
    const fn = src.slice(src.indexOf('export async function sweetTitleTypeConfirm'))
    expect(fn).toContain("confirmButtonText: 'Change type'")
    expect(fn).toContain("denyButtonText: 'Publish anyway'")
    expect(fn).toContain('focusConfirm: true')
    expect(fn).not.toMatch(/reverseButtons:\s*true/)
    expect(fn).toMatch(/isConfirmed/)
    expect(fn).toMatch(/isDenied/)
  })
  it('does not reuse sweetConfirm as-is for this dialog (sweetConfirm keeps reverseButtons: true)', () => {
    const confirm = src.slice(src.indexOf('export async function sweetConfirm'), src.indexOf('export async function sweetToast'))
    expect(confirm).toContain('reverseButtons: true')
    expect(src).toContain('sweetTitleTypeConfirm')
  })
})
