import type { AppUser } from '../types/domain'

export type LandlordWaitingRow = {
  userId: string
  name: string
  submittedAt?: string
  role: 'landlord'
  status: 'pending'
  href: string
}

export type LandlordWaitingListView = {
  /** Empty means the screen shows nothing for this list. */
  rows: LandlordWaitingRow[]
  /** The waiting list never approves or declines. */
  actions: readonly []
}

type WaitingUser = Pick<AppUser, 'id' | 'name' | 'role' | 'verification'>

/** Pending landlords only. Seed users with no verification object are not included. */
export function buildLandlordWaitingList(users: readonly WaitingUser[]): LandlordWaitingListView {
  const rows = users
    .filter((user) => user.role === 'landlord' && user.verification?.status === 'pending')
    .map((user) => ({
      userId: user.id,
      name: user.name,
      submittedAt: user.verification?.submittedAt,
      role: 'landlord' as const,
      status: 'pending' as const,
      href: `/workspace/admin/users/${user.id}`,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
  return { rows, actions: [] }
}
