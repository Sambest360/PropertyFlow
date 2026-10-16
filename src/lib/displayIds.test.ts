import { describe, expect, it } from 'vitest'
import {
  hideBackendUuid,
  isBackendUuid,
  labelOrReference,
  sanitizeUserFacingMessage,
} from './displayIds'

describe('displayIds', () => {
  it('detects RFC4122 uuids', () => {
    expect(isBackendUuid('a3000001-0001-4000-8000-000000000101')).toBe(true)
    expect(isBackendUuid('APP-1')).toBe(false)
    expect(isBackendUuid('PR-1011')).toBe(false)
    expect(isBackendUuid('u-agent1')).toBe(false)
  })

  it('hideBackendUuid masks uuids only', () => {
    expect(hideBackendUuid('a3000001-0001-4000-8000-000000000101')).toBe('—')
    expect(hideBackendUuid('APP-1', '—')).toBe('APP-1')
    expect(hideBackendUuid('', 'n/a')).toBe('n/a')
  })

  it('labelOrReference prefers label and hides uuid fallbacks', () => {
    expect(labelOrReference('Sea View', 'uuid-here', 'Unknown')).toBe('Sea View')
    expect(
      labelOrReference(undefined, 'a3000001-0001-4000-8000-000000000101', 'Property'),
    ).toBe('Property')
    expect(labelOrReference(undefined, 'PR-9', 'Property')).toBe('PR-9')
  })

  it('sanitizeUserFacingMessage removes embedded uuids', () => {
    expect(
      sanitizeUserFacingMessage(
        'Link failed for 22222222-2222-2222-2222-222222222222 on server',
      ),
    ).toBe('Link failed for [hidden] on server')
  })
})
