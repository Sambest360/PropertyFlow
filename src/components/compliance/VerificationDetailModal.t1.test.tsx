import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

// Static render: the modal shell inline (no portal / focus trap).
vi.mock('../ui', async (orig) => ({
  ...(await orig<typeof import('../ui')>()),
  Modal: ({ title, description, children, footer }: { title: ReactNode; description?: ReactNode; children: ReactNode; footer?: ReactNode }) => (
    <div>
      <h2>{title}</h2>
      <p>{description}</p>
      {children}
      <footer>{footer}</footer>
    </div>
  ),
}))
import type { AppUser } from '../../types/domain'
import { maskIdNumber } from '../../lib/screening/consentTerms'
import { VerificationDetailModal } from './VerificationDetailModal'

/** T1 ruling (a): the super admin's verification view renders a masked ID sensibly. */
const FULL = '7505055009081'
const user = {
  id: 'u-ll',
  name: 'Lerato Landlord',
  role: 'landlord',
  email: 'll@example.com',
  phone: '0820000000',
  active: true,
  agencyId: null,
  idNumberOrPassport: maskIdNumber(FULL),
  verification: {
    status: 'pending',
    submittedAt: '2026-10-30T08:00:00Z',
    profile: { company: 'LL Pty', idNumberOrPassport: maskIdNumber(FULL) },
    documents: [],
  },
} as unknown as AppUser

describe('VerificationDetailModal with a masked ID', () => {
  it('shows the masked ID in both places, never undefined, and keeps the decision buttons', () => {
    const html = renderToStaticMarkup(
      <VerificationDetailModal user={user} canDecide busy={false} onClose={() => {}} onApprove={() => {}} onReject={() => {}} />,
    )
    expect(html.split(maskIdNumber(FULL)).length - 1).toBe(2)
    expect(html).not.toContain(FULL)
    expect(html).not.toMatch(/undefined|null|NaN/)
    expect(html).toContain('Approve')
    expect(html).toContain('Reject')
  })

  it('a user with no ID shows a dash', () => {
    const html = renderToStaticMarkup(
      <VerificationDetailModal
        user={{ ...user, idNumberOrPassport: undefined, verification: { status: 'pending', documents: [] } } as unknown as AppUser}
        canDecide={false}
        busy={false}
        onClose={() => {}}
        onApprove={() => {}}
        onReject={() => {}}
      />,
    )
    expect(html).toContain('—')
    expect(html).not.toMatch(/undefined|NaN/)
  })
})
