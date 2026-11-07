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

describe('groupToastBurst', () => {
  const toast = (n: number) => ({
    id: `t-${n}`,
    notificationId: `N-${n}`,
    userId: 'u-1',
    title: `Escalated (level 1): invoice ${n} unpaid`,
    body: 'Pay it',
    link: '/workspace/admin/subscription',
    durationMs: 8000,
    createdAt: 0,
  })
  it('keeps one or two pop-ups as they are', async () => {
    const { groupToastBurst } = await import('./notificationSync')
    expect(groupToastBurst([toast(1), toast(2)]).map((t) => t.id)).toEqual(['t-1', 't-2'])
  })
  it('turns a burst into one pop-up that counts them', async () => {
    const { groupToastBurst } = await import('./notificationSync')
    const out = groupToastBurst([toast(1), toast(2), toast(3), toast(4)])
    expect(out).toHaveLength(1)
    expect(out[0].title).toBe('4 new notifications')
    expect(out[0].body).toBe('Escalated (level 1) and more')
    expect(out[0].summaryCount).toBe(4)
    expect(out[0].link).toBeUndefined()
  })
})
