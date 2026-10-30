import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { EnquiryConfirmation } from './EnquiryConfirmation'

/** T3: the inline confirmation that stays on the form (no modal, no reset). */
describe('T3 EnquiryConfirmation', () => {
  it('shows the title, body and reference in a status region', () => {
    const html = renderToStaticMarkup(
      <EnquiryConfirmation
        outcome={{ tone: 'success', title: 'Interest registered', body: 'Thandi will follow up.', reference: 'LD-guest-1-abc' }}
      />,
    )
    expect(html).toContain('role="status"')
    expect(html).toContain('Interest registered')
    expect(html).toContain('ref LD-guest-1-abc')
  })

  it('an error is an alert region and shows no reference', () => {
    const html = renderToStaticMarkup(
      <EnquiryConfirmation outcome={{ tone: 'error', title: 'Could not save enquiry', body: 'Try again.', reference: null }} />,
    )
    expect(html).toContain('role="alert"')
    expect(html).not.toContain('ref ')
  })

  it('renders nothing without an outcome', () => {
    expect(renderToStaticMarkup(<EnquiryConfirmation outcome={null} />)).toBe('')
  })
})
