import { describe, expect, it } from 'vitest'
import { diffNewNotifications } from './notificationSync'
import type { AppNotification } from '../types/domain'

const note = (id: string, userId: string, read = false): AppNotification => ({
  id,
  userId,
  agencyId: 'ag-1',
  title: 'Test',
  body: 'Body',
  at: '2026-08-05T12:00:00.000Z',
  read,
})

describe('diffNewNotifications', () => {
  it('returns unread notifications not in the previous snapshot', () => {
    const prev = [note('N-1', 'u-1')]
    const next = [note('N-1', 'u-1'), note('N-2', 'u-1'), note('N-3', 'u-2')]
    expect(diffNewNotifications(prev, next, 'u-1').map((n) => n.id)).toEqual(['N-2'])
  })

  it('ignores already-read notifications', () => {
    const prev: AppNotification[] = []
    const next = [note('N-1', 'u-1', true)]
    expect(diffNewNotifications(prev, next, 'u-1')).toEqual([])
  })

  it('does not toast twice when the server sends back a just-shown notification under its database id', () => {
    const now = new Date().toISOString()
    const local = { ...note('N-local', 'u-1'), title: 'Application submitted', at: now }
    const echoed = { ...local, id: '7eb09e47-bc24-498e-a51e-411fae8f7465' }
    expect(diffNewNotifications([local], [echoed], 'u-1')).toEqual([])
  })
})
