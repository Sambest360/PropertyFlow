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
})
