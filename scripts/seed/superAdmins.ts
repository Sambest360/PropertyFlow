export type SuperAdminDef = {
  email: string
  feId: string
  firstName: string
  lastName: string
}

/** Platform super admins — preserved on demo seed reset. */
export const SUPER_ADMINS: SuperAdminDef[] = [
  {
    email: 'ephraimbampo317@gmail.com',
    feId: 'u-super-ephraim',
    firstName: 'Ephraim',
    lastName: 'Bampo',
  },
  {
    email: 'sambampo200@gmail.com',
    feId: 'u-super',
    firstName: 'Samuel',
    lastName: 'Bampo',
  },
]

export function superAdminByEmail(email: string): SuperAdminDef | undefined {
  const target = email.trim().toLowerCase()
  return SUPER_ADMINS.find((a) => a.email.toLowerCase() === target)
}
