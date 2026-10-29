/** Client auth: always the API's own session (there is no other mode). */
export type AuthMode = 'api'

export const clientAuthMode: AuthMode = 'api'

let logged = false
export function logClientAuthModeOnce(): void {
  if (logged) return
  logged = true
  console.info(`[auth] resolved client auth mode: ${clientAuthMode}`)
}
