/**
 * D3: when the "Reset password" entry shows. Only with users.manage, only on
 * the real server (API mode), never on your own row or on a super admin. The
 * server (POST /api/auth/reset-password) is the real gate.
 */
export function showPasswordResetEntry(input: {
  hasUsersManage: boolean
  apiMode: boolean
  viewerId: string
  target: { id: string; role: string } | null | undefined
}): boolean {
  const { hasUsersManage, apiMode, viewerId, target } = input
  if (!hasUsersManage || !apiMode || !target) return false
  if (target.id === viewerId) return false
  if (target.role === 'super_admin') return false
  return true
}
