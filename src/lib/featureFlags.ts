/** Staff invite calls POST /invite, which is landing in parallel. Keep the UI off until it is enabled. */
export function staffInviteEnabled(): boolean {
  const flag = import.meta.env.VITE_STAFF_INVITE
  return flag === '1' || flag === 'true'
}
