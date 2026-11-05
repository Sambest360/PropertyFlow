import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SignedCopyNote } from './SignedCopyNote'
import { signedCopyState } from '../../lib/lease/signedCopy'

describe('CR10 part 7: signed copy', () => {
  it('in-app signing completed: points to the lease download, no guessed link', () => {
    const html = renderToStaticMarkup(<SignedCopyNote eSign={{ status: 'completed', provider: 'mock', nonProduction: true }} />)
    expect(html).toContain('Download the lease to see the signatures recorded in the app.')
    expect(html).not.toContain('<a')
    expect(html).not.toMatch(/mock|environment/i)
  })
  it('SigniFlow completed without a stored URL: honest not-available text, no guessed link', () => {
    expect(signedCopyState({ status: 'completed', provider: 'signiflow' })).toEqual({ kind: 'none', text: 'Signed copy not available yet.' })
  })
  it('nothing before completion', () => {
    expect(renderToStaticMarkup(<SignedCopyNote eSign={{ status: 'partially_signed', provider: 'mock' }} />)).toBe('')
  })
})
