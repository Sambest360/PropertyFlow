/**
 * Account status shown in user lists: a new account is Pending until its
 * owner confirms the email address, then Active. Disabled accounts stay
 * Disabled (or Inactive where that word is used).
 */
export function accountStatusLabel(
  user: { active: boolean; emailVerified?: boolean },
  offLabel: 'Disabled' | 'Inactive' = 'Disabled',
): 'Active' | 'Pending' | 'Disabled' | 'Inactive' {
  if (!user.active) return offLabel
  return user.emailVerified === false ? 'Pending' : 'Active'
}
