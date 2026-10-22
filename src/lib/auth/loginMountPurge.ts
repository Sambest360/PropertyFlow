/** Whether LoginPage should call purgeLocalIdentity on mount (guest anonymous zone). */
export function shouldPurgeGuestOnLoginMount(opts: {
  isAuthenticated: boolean
  loginInFlight: boolean
  bouncedToWorkspace: boolean
  authReady: boolean
  hasAuthToken: boolean
}): boolean {
  if (opts.isAuthenticated || opts.loginInFlight) return false
  if (opts.bouncedToWorkspace) {
    if (!opts.authReady) return false
    if (opts.hasAuthToken) return false
  }
  return true
}
