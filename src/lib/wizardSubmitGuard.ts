/** Synchronous in-flight lock — React `busy` state updates too late to stop double-clicks. */
export function acquireSubmitLock(lock: { current: boolean }): boolean {
  if (lock.current) return false
  lock.current = true
  return true
}

export function releaseSubmitLock(lock: { current: boolean }): void {
  lock.current = false
}
