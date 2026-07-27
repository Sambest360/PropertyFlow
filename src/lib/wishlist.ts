const STORAGE_PREFIX = 'propertyflow-wishlist:'
const memory = new Map<string, string[]>()

function storageKey(userId: string | null | undefined): string {
  return `${STORAGE_PREFIX}${userId?.trim() || 'guest'}`
}

function readIds(userId: string | null | undefined): string[] {
  const key = storageKey(userId)
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(key)
      if (raw) {
        const parsed = JSON.parse(raw) as unknown
        if (Array.isArray(parsed)) {
          return parsed.filter((id): id is string => typeof id === 'string' && id.length > 0)
        }
      }
    } catch {
      /* fall through to memory */
    }
  }
  return memory.get(key) ?? []
}

function writeIds(userId: string | null | undefined, ids: string[]) {
  const key = storageKey(userId)
  const unique = [...new Set(ids)]
  memory.set(key, unique)
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(key, JSON.stringify(unique))
  } catch {
    /* memory already updated */
  }
}

export function getWishlistIds(userId: string | null | undefined): string[] {
  return readIds(userId)
}

export function isOnWishlist(userId: string | null | undefined, propertyId: string): boolean {
  return readIds(userId).includes(propertyId)
}

export function toggleWishlist(
  userId: string | null | undefined,
  propertyId: string,
): { saved: boolean; ids: string[] } {
  const current = readIds(userId)
  const saved = current.includes(propertyId)
  const ids = saved ? current.filter((id) => id !== propertyId) : [...current, propertyId]
  writeIds(userId, ids)
  return { saved: !saved, ids }
}

export function setWishlistIds(userId: string | null | undefined, ids: string[]) {
  writeIds(userId, ids)
}
