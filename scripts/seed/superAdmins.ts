export type SuperAdminDef = {
  email: string
  feId: string
  firstName: string
  lastName: string
}

/** Platform super admins — preserved on demo seed reset. */
export const SUPER_ADMINS: SuperAdminDef[] = [
  {
    email: 'ephraim.admin@example.test',
    feId: 'u-super-ephraim',
    firstName: 'Ephraim',
    lastName: 'Bampo',
  },
  {
    email: 'samuel.admin@example.test',
    feId: 'u-super',
    firstName: 'Samuel',
    lastName: 'Bampo',
  },
]

export function superAdminByEmail(email: string): SuperAdminDef | undefined {
  const target = email.trim().toLowerCase()
  return SUPER_ADMINS.find((a) => a.email.toLowerCase() === target)
}
