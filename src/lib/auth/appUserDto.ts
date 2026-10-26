import type { AppUser } from '../../types/domain'
import type { AuthUserDto } from '../api/authClient'

/** Session DTO for an app user (no Supabase SDK, so the app shell can use it). */
export function appUserToDto(user: AppUser): AuthUserDto {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    agencyId: user.agencyId,
    phone: user.phone,
    active: user.active,
    enabledPermissions: user.enabledPermissions,
    licenseStatus: user.licenseStatus ?? null,
    mentorId: user.mentorId ?? null,
    commissionSharePct: user.commissionSharePct ?? null,
    company: user.company,
    idNumberOrPassport: user.idNumberOrPassport,
    verification: user.verification,
    mustChangePassword: user.mustChangePassword === true ? true : undefined,
  }
}
