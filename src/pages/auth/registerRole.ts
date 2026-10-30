/** Roles anyone may pick on /register (server/auth.ts clamps to the same set). */
export const PUBLIC_REGISTER_ROLES = ['tenant', 'landlord', 'contractor'] as const

export type PublicRegisterRole = (typeof PUBLIC_REGISTER_ROLES)[number]

/**
 * Footer "List with us" target (T6, Jim T5 C6): Landlord preselected, because
 * agencies are not self-serve (/contact tells them to email support).
 */
export const LIST_WITH_US_PATH = '/register?role=landlord'

/**
 * Initial role for the register wizard from ?role=. Only a public role is
 * accepted; anything else (missing, staff or admin roles) keeps the
 * Applicant / Tenant default. The user can still change it on step 2.
 */
export function initialRegisterRole(raw: string | null | undefined): PublicRegisterRole {
  const value = (raw ?? '').trim().toLowerCase()
  return (PUBLIC_REGISTER_ROLES as readonly string[]).includes(value) ? (value as PublicRegisterRole) : 'tenant'
}
