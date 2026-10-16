/** Ignore stale async refresh applies when a newer refresh was started. */
export function shouldApplyRefreshResult(requestId: number, latestRequestId: number): boolean {
  return requestId === latestRequestId
}

export function nextRefreshRequestId(counter: { current: number }): number {
  counter.current += 1
  return counter.current
}

/** Guest/signed-in marketplace refresh: never substitute an empty shell when fetch misses. */
export function marketplaceRefreshPreservesOnMiss<T>(prev: T, fetched: T | null | undefined): T {
  return fetched ?? prev
}
