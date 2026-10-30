// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LIST_WITH_US_PATH } from './registerRole'

/**
 * T6 C6 (Angela #118 C3): prove the ?role= preselect by behaviour, not by source text.
 * Renders the real RegisterPage in a DOM (effects run), fills step 1, presses
 * Continue and reads which role the step-2 picker shows as pressed.
 */
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    register: vi.fn(),
    isAuthenticated: false,
    authReady: true,
    user: null,
    purgeLocalIdentity: vi.fn(async () => {}),
  }),
}))
vi.mock('../../lib/api/authClient', () => ({ apiAuthBootstrapNeeded: vi.fn(async () => false) }))
vi.mock('../../lib/sweetAlert', () => ({
  redirectToLogin: vi.fn(),
  showAuthError: vi.fn(async () => {}),
  showAuthWarning: vi.fn(async () => {}),
  showRegistrationCompleteAlert: vi.fn(async () => {}),
}))
vi.mock('../../components/PlacesAddressInput', () => ({ PlacesAddressInput: () => null }))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let host: HTMLElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
})

function type(id: string, value: string) {
  const el = document.getElementById(id) as HTMLInputElement | null
  if (!el) throw new Error(`missing input #${id}`)
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set
  setter?.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

function button(label: string): HTMLButtonElement {
  const b = Array.from(document.querySelectorAll('button')).find((x) => x.textContent?.trim() === label)
  if (!b) throw new Error(`missing button "${label}"`)
  return b as HTMLButtonElement
}

/** Pressed role label(s) on step 2 after arriving at `url`. */
async function pressedRolesOnStep2(url: string): Promise<string[]> {
  const { default: RegisterPage } = await import('./RegisterPage')
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => {
    root!.render(
      <MemoryRouter initialEntries={[url]}>
        <RegisterPage />
      </MemoryRouter>,
    )
  })
  // Test-only form values (not real people or credentials).
  await act(async () => {
    type('reg-first', 'Test')
    type('reg-last', 'Person')
    type('reg-email', 'person@example.test')
    type('reg-phone', '0000000000')
    type('reg-password', 'test-only-passphrase-1')
    type('reg-confirm', 'test-only-passphrase-1')
  })
  await act(async () => {
    button('Continue').click()
  })
  const picker = host.querySelector('fieldset')
  if (!picker) throw new Error('step 2 role picker not shown')
  return Array.from(picker.querySelectorAll('button[aria-pressed="true"]')).map(
    (b) => b.querySelector('.font-semibold')?.textContent ?? '',
  )
}

describe('T6 C6: /register?role= preselects the role on step 2 (render test)', () => {
  it('"List with us" (/register?role=landlord) shows Landlord pressed on step 2', async () => {
    expect(await pressedRolesOnStep2(LIST_WITH_US_PATH)).toEqual(['Landlord'])
  })

  it('plain /register shows Applicant / Tenant pressed', async () => {
    expect(await pressedRolesOnStep2('/register')).toEqual(['Applicant / Tenant'])
  })

  it('a staff role in ?role= is ignored (Applicant / Tenant pressed)', async () => {
    expect(await pressedRolesOnStep2('/register?role=super_admin')).toEqual(['Applicant / Tenant'])
  })

  it('the user can still change the role on step 2', async () => {
    await pressedRolesOnStep2(LIST_WITH_US_PATH)
    await act(async () => {
      const contractor = Array.from(host!.querySelectorAll('fieldset button')).find((b) => b.querySelector('.font-semibold')?.textContent === 'Contractor')
      ;(contractor as HTMLButtonElement).click()
    })
    const pressed = Array.from(host!.querySelectorAll('fieldset button[aria-pressed="true"]')).map((b) => b.querySelector('.font-semibold')?.textContent)
    expect(pressed).toEqual(['Contractor'])
  })
})
