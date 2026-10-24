/**
 * Which leads / applications / viewings / payments / tickets the signed-in
 * user has not opened yet (src/lib/unopened.ts). Lists show a dot, detail
 * pages mark items opened, and the sidebar shows per-section counts.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuth, usePropertyScope } from './AuthContext'
import { useStore } from './AppStore'
import {
  UNOPENED_KINDS,
  countUnopened,
  emptyOpenedStore,
  isUnopenedIn,
  markOpenedIn,
  openedStorageKey,
  parseOpenedStore,
  seedOpened,
  type OpenedStore,
  type UnopenedKind,
} from '../lib/unopened'

type UnopenedContextValue = {
  isUnopened: (kind: UnopenedKind, id: string) => boolean
  markOpened: (kind: UnopenedKind, id: string | null | undefined) => void
  counts: Record<UnopenedKind, number>
}

const ZERO: Record<UnopenedKind, number> = { lead: 0, application: 0, viewing: 0, payment: 0, ticket: 0 }

const UnopenedContext = createContext<UnopenedContextValue>({
  isUnopened: () => false,
  markOpened: () => {},
  counts: ZERO,
})

function readStore(userId: string | null): OpenedStore {
  if (!userId) return emptyOpenedStore()
  try {
    return parseOpenedStore(localStorage.getItem(openedStorageKey(userId)))
  } catch {
    return emptyOpenedStore()
  }
}

function writeStore(userId: string, store: OpenedStore) {
  try {
    localStorage.setItem(openedStorageKey(userId), JSON.stringify(store))
  } catch {
    /* quota / private mode: indicators just reset next visit */
  }
}

export function UnopenedProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, user } = useAuth()
  const { state, hydratedForUserId } = useStore()
  const { dealVisible, paymentVisible, ticketVisible } = usePropertyScope()
  const userId = isAuthenticated && user.id !== 'guest' ? user.id : null
  const [store, setStore] = useState<OpenedStore>(() => readStore(userId))

  // Switch users / other tabs opening items.
  useEffect(() => {
    setStore(readStore(userId))
    if (!userId) return
    const onStorage = (e: StorageEvent) => {
      if (e.key === openedStorageKey(userId)) setStore(readStore(userId))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [userId])

  const idsByKind = useMemo<Record<UnopenedKind, string[]>>(
    () => ({
      lead: state.leads.filter((l) => dealVisible(l)).map((l) => l.id),
      application: state.applications.filter((a) => dealVisible(a)).map((a) => a.id),
      viewing: state.viewings.filter((v) => dealVisible(v)).map((v) => v.id),
      payment: state.payments.filter((p) => paymentVisible(p)).map((p) => p.id),
      ticket: state.tickets.filter((t) => ticketVisible(t)).map((t) => t.id),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.leads, state.applications, state.viewings, state.payments, state.tickets, userId],
  )

  // First load of this user's own data: everything already there counts as opened.
  const hydrated = Boolean(userId) && hydratedForUserId === userId
  useEffect(() => {
    if (!hydrated || !userId) return
    setStore((prev) => {
      const next = seedOpened(prev, idsByKind)
      if (next !== prev) writeStore(userId, next)
      return next
    })
  }, [hydrated, userId, idsByKind])

  const markOpened = useCallback(
    (kind: UnopenedKind, id: string | null | undefined) => {
      if (!userId || !id) return
      setStore((prev) => {
        const next = markOpenedIn(prev, kind, id)
        if (next !== prev) writeStore(userId, next)
        return next
      })
    },
    [userId],
  )

  const value = useMemo<UnopenedContextValue>(() => {
    const counts = { ...ZERO }
    for (const kind of UNOPENED_KINDS) counts[kind] = countUnopened(store, kind, idsByKind[kind])
    return {
      isUnopened: (kind, id) => isUnopenedIn(store, kind, id),
      markOpened,
      counts,
    }
  }, [store, idsByKind, markOpened])

  return <UnopenedContext.Provider value={value}>{children}</UnopenedContext.Provider>
}

export function useUnopened(): UnopenedContextValue {
  return useContext(UnopenedContext)
}

/** Detail pages: mark the item opened once it is on screen. */
export function useMarkOpened(kind: UnopenedKind, id: string | null | undefined) {
  const { markOpened } = useUnopened()
  useEffect(() => {
    if (id) markOpened(kind, id)
  }, [kind, id, markOpened])
}

/** Small blue "not opened yet" dot for list rows. */
export function UnopenedDot({ kind, id, className }: { kind: UnopenedKind; id: string; className?: string }) {
  const { isUnopened } = useUnopened()
  if (!isUnopened(kind, id)) return null
  return (
    <span
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-primary ring-2 ring-white ${className ?? ''}`}
      title="New – not opened yet"
    >
      <span className="sr-only">New, not opened yet</span>
    </span>
  )
}
