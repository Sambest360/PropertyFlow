/**
 * The details a person keeps on their own profile, and how complete it is.
 * Role, agency and account status are never on this list: an administrator
 * changes those.
 */
import type { AppUser, UserProfileDetails } from '../types/domain'

export type ProfileFieldKey = keyof UserProfileDetails

export const PROFILE_SECTIONS: Array<{ title: string; hint: string; fields: Array<{ key: ProfileFieldKey; label: string; type?: 'text' | 'tel' | 'textarea' | 'select'; options?: string[] }> }> = [
  {
    title: 'About you',
    hint: 'How we address you, and a little background.',
    fields: [
      { key: 'preferredName', label: 'Preferred name' },
      { key: 'gender', label: 'Gender', type: 'select', options: ['Female', 'Male', 'Non-binary', 'Prefer not to say'] },
      { key: 'nationality', label: 'Nationality' },
      { key: 'occupation', label: 'Occupation' },
      { key: 'alternatePhone', label: 'Alternative phone', type: 'tel' },
    ],
  },
  {
    title: 'Home address',
    hint: 'Where you live now. Used on leases and official letters.',
    fields: [
      { key: 'addressLine1', label: 'Street address' },
      { key: 'addressLine2', label: 'Unit, complex or building (optional)' },
      { key: 'suburb', label: 'Suburb' },
      { key: 'city', label: 'City or town' },
      { key: 'province', label: 'Province or state' },
      { key: 'postalCode', label: 'Postal code' },
      { key: 'country', label: 'Country' },
    ],
  },
  {
    title: 'Emergency contact',
    hint: 'Someone we can call if we cannot reach you.',
    fields: [
      { key: 'emergencyName', label: 'Full name' },
      { key: 'emergencyRelationship', label: 'Relationship' },
      { key: 'emergencyPhone', label: 'Phone', type: 'tel' },
    ],
  },
]

/** Fields counted for "profile complete". */
export function profileCompleteness(u: AppUser | undefined): { done: number; total: number; missing: string[] } {
  const d = u?.profileDetails ?? {}
  const checks: Array<[string, boolean]> = [
    ['First name and surname', Boolean(u?.firstName?.trim() || u?.name?.includes(' '))],
    ['Phone', Boolean(u?.phone?.trim())],
    ['Profile photo', Boolean(u?.avatar)],
    ['ID or passport number', Boolean(u?.idNumberOrPassport?.trim())],
    ['Date of birth', Boolean(u?.dateOfBirth)],
    ['Home address', Boolean(d.addressLine1?.trim() && d.city?.trim())],
    ['Emergency contact', Boolean(d.emergencyName?.trim() && d.emergencyPhone?.trim())],
  ]
  return { done: checks.filter(([, ok]) => ok).length, total: checks.length, missing: checks.filter(([, ok]) => !ok).map(([l]) => l) }
}

/** SA ID numbers carry the date of birth (YYMMDD…). */
export function dobFromSaId(id: string): string | null {
  const m = /^(\d{2})(\d{2})(\d{2})\d{7}$/.exec(id.replace(/\s/g, ''))
  if (!m) return null
  const yy = Number(m[1])
  const century = yy > (new Date().getFullYear() % 100) ? 1900 : 2000
  const iso = `${century + yy}-${m[2]}-${m[3]}`
  const d = new Date(`${iso}T00:00:00Z`)
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : iso
}

export function maskId(id: string | undefined): string {
  if (!id) return ''
  return id.length <= 4 ? id : `${'•'.repeat(Math.max(0, id.length - 4))}${id.slice(-4)}`
}
