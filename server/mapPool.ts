/**
 * Run async tasks with a concurrency ceiling (avoids wedging transaction poolers).
 */
export async function mapPool<T, R>(
    items: readonly T[],
    concurrency: number,
    fn: (item: T, index: number) => Promise<R>,
  ): Promise<R[]> {
    const limit = Math.max(1, concurrency)
    const results: R[] = new Array(items.length)
    let next = 0
  
    async function worker() {
      while (next < items.length) {
        const i = next++
        results[i] = await fn(items[i]!, i)
      }
    }
  
    const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker())
    await Promise.all(workers)
    return results
  }
  