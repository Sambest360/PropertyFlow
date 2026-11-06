let reloadedForPreload = false

export function resetPreloadReloadGuardForTests(): void {
  reloadedForPreload = false
}

/**
 * After a release, a tab opened before it can ask for a page file the new
 * release no longer has. Reload once to pick up the new release instead of
 * showing an error or loading forever (at most once a minute when
 * sessionStorage works; at most once per page lifetime when it throws).
 */
export function handleVitePreloadError(event: Event): void {
  if (reloadedForPreload) return
  reloadedForPreload = true
  try {
    const last = Number(sessionStorage.getItem('pf-reloaded-for-release') || 0)
    if (Date.now() - last < 60_000) return
    sessionStorage.setItem('pf-reloaded-for-release', String(Date.now()))
  } catch {
    /* storage blocked: still reload once */
  }
  event.preventDefault()
  window.location.reload()
}
