import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bell,
  CheckCheck,
  CircleAlert,
  CircleCheck,
  CircleDot,
  Trash2,
  X,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useStore } from '../../context/AppStore'
import { formatRelativeTime } from '../../lib/suiteAlerts'
import type { NotificationToast } from '../../lib/suiteAlerts'
import { Button, cn } from '../ui'
import { useNotificationPrefs } from '../../hooks/useNotificationPrefs'
import { showsInApp } from '../../lib/notificationCategories'
import { OPEN_NOTIFICATIONS_EVENT } from '../../lib/notificationSync'

const ICON_STROKE = 1.6

export function NotificationBell({ className }: { className?: string }) {
  const { user } = useAuth()
  const { state, markNotificationRead, markAllNotificationsRead } = useStore()
  const { prefs } = useNotificationPrefs()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  const mine = useMemo(
    () =>
      state.notifications
        .filter((n) => n.userId === user.id && showsInApp(prefs, n.resource))
        .sort((a, b) => b.at.localeCompare(a.at)),
    [state.notifications, user.id, prefs],
  )
  const unread = mine.filter((n) => !n.read).length

  // Buzz when the unread count first loads after sign-in (instead of a pile of
  // pop-ups), and again whenever it goes up.
  const [buzzKey, setBuzzKey] = useState(0)
  const lastUnreadRef = useRef<number | null>(null)
  useEffect(() => {
    const before = lastUnreadRef.current
    lastUnreadRef.current = unread
    if (unread > 0 && (before === null || before === 0 || unread > before)) setBuzzKey((k) => k + 1)
  }, [unread])
  useEffect(() => {
    lastUnreadRef.current = null
  }, [user.id])

  useEffect(() => {
    const openList = () => setOpen(true)
    window.addEventListener(OPEN_NOTIFICATIONS_EVENT, openList)
    return () => window.removeEventListener(OPEN_NOTIFICATIONS_EVENT, openList)
  }, [])

  useEffect(() => {
    if (!open) return
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        className="relative inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-2xl border border-primary-100 bg-white text-ink-400 transition-colors duration-200 hover:border-primary-200 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
      >
        <Bell
          key={buzzKey}
          className={cn('h-5 w-5', buzzKey > 0 && 'animate-bell-buzz')}
          strokeWidth={ICON_STROKE}
          aria-hidden
        />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold tabular text-white ring-2 ring-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-primary-100 bg-white shadow-lg shadow-primary-100/40 animate-fade-in"
        >
          <div className="flex items-center justify-between gap-2 border-b border-primary-50 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-ink">Notifications</p>
              <p className="text-xs tabular text-ink-400">
                {unread ? `${unread} unread` : 'All caught up'}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-h-11 px-2"
                  onClick={() => markAllNotificationsRead(user.id)}
                >
                  <CheckCheck className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                  <span className="sr-only sm:not-sr-only sm:ml-1">Mark all read</span>
                </Button>
              )}
            </div>
          </div>

          <ul className="max-h-[min(24rem,60vh)] overflow-y-auto scrollbar-thin">
            {mine.map((n) => (
              <li key={n.id} className="border-b border-primary-50 last:border-0">
                <button
                  type="button"
                  className={cn(
                    'flex w-full cursor-pointer gap-3 px-4 py-3 text-left transition-colors duration-200 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
                    !n.read && 'bg-primary-50/60',
                  )}
                  onClick={() => {
                    markNotificationRead(n.id)
                    setOpen(false)
                    if (n.link) navigate(n.link)
                  }}
                >
                  <span
                    className={cn(
                      'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                      n.read ? 'bg-transparent' : 'bg-accent',
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-ink">{n.title}</span>
                    <span className="mt-0.5 block text-xs text-ink-500 line-clamp-2">{n.body}</span>
                    <span className="mt-1 block text-[11px] tabular text-ink-400">
                      {formatRelativeTime(n.at)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {!mine.length && (
              <li className="px-4 py-10 text-center text-sm text-ink-400">
                No notifications yet. Suite events will appear here.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}

/** Live event strip — distinct from centered Suite Alert (SweetAlert) dialogs. */
export function NotificationToastHost() {
  const { user } = useAuth()
  const { state, toasts, dismissToast, markNotificationRead } = useStore()
  const { prefs } = useNotificationPrefs()
  const navigate = useNavigate()
  const compact = useIsCompactScreen()
  const mine = toasts.filter((t) => {
    if (t.userId !== user.id) return false
    if (t.summaryCount) return true
    const source = state.notifications.find((n) => n.id === t.notificationId)
    return showsInApp(prefs, source?.resource)
  })
  // Phones show one pop-up at a time (the rest wait their turn) so the page
  // stays usable; larger screens show up to three.
  const visible = mine.slice(0, compact ? 1 : 3)
  const waiting = mine.length - visible.length

  return (
    <div
      className="pointer-events-none fixed inset-x-3 top-[max(0.5rem,env(safe-area-inset-top))] z-[70] flex flex-col gap-2 sm:inset-x-auto sm:right-5 sm:top-4 sm:w-[22rem]"
      aria-live="polite"
    >
      {visible.map((toast, i) => (
        <ToastCard
          key={toast.id}
          toast={toast}
          compact={compact}
          waiting={i === visible.length - 1 ? waiting : 0}
          onDismiss={() => dismissToast(toast.id)}
          onOpen={() => {
            dismissToast(toast.id)
            if (toast.summaryCount) {
              window.dispatchEvent(new Event(OPEN_NOTIFICATIONS_EVENT))
              return
            }
            markNotificationRead(toast.notificationId)
            if (toast.link) navigate(toast.link)
          }}
        />
      ))}
    </div>
  )
}

/** True below the sm breakpoint (640px). */
function useIsCompactScreen(): boolean {
  const query = '(max-width: 639px)'
  const [compact, setCompact] = useState(
    () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches,
  )
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia(query)
    const on = () => setCompact(mql.matches)
    on()
    mql.addEventListener?.('change', on)
    return () => mql.removeEventListener?.('change', on)
  }, [])
  return compact
}

function ToastCard({
  toast,
  compact = false,
  waiting = 0,
  onDismiss,
  onOpen,
}: {
  toast: NotificationToast
  compact?: boolean
  /** Pop-ups queued behind this one (shown as "+N more"). */
  waiting?: number
  onDismiss: () => void
  onOpen: () => void
}) {
  const [remaining, setRemaining] = useState(toast.durationMs)
  const [paused, setPaused] = useState(false)
  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  // The host passes a new onDismiss each render; keep the countdown from
  // restarting whenever the page re-renders.
  const dismissRef = useRef(onDismiss)
  dismissRef.current = onDismiss
  const remainingRef = useRef(toast.durationMs)

  useEffect(() => {
    if (paused) return
    const started = Date.now()
    const startLeft = remainingRef.current
    const tick = window.setInterval(() => {
      const left = Math.max(0, startLeft - (Date.now() - started))
      remainingRef.current = left
      setRemaining(left)
      if (left <= 0) {
        window.clearInterval(tick)
        dismissRef.current()
      }
    }, reduced ? 250 : 50)
    return () => window.clearInterval(tick)
  }, [paused, reduced])

  const progress = Math.max(0, Math.min(1, remaining / toast.durationMs))
  const tone = toast.tone ?? 'info'
  const style = TOAST_STYLES[tone]
  const Icon = style.Icon

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={cn(
        'pointer-events-auto relative overflow-hidden rounded-2xl border bg-white shadow-lg animate-slide-down',
        style.border,
        style.shadow,
      )}
    >
      <div className={cn('absolute inset-y-0 left-0 w-1', style.bar)} aria-hidden />
      <button
        type="button"
        className={cn(
          'flex w-full cursor-pointer text-left transition-colors duration-200 hover:bg-primary-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
          compact ? 'items-center gap-2.5 py-2 pl-3 pr-11' : 'gap-3 py-3 pl-4 pr-12',
        )}
        onClick={onOpen}
      >
        <span
          className={cn(
            'inline-flex shrink-0 items-center justify-center rounded-xl',
            compact ? 'h-8 w-8' : 'mt-0.5 h-9 w-9',
            style.iconWrap,
          )}
        >
          <Icon className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn('text-sm font-semibold text-ink', compact ? 'block truncate' : 'line-clamp-2')}>
            {toast.title}
          </span>
          <span className={cn('mt-0.5 text-xs text-ink-500', compact ? 'block truncate' : 'line-clamp-2')}>
            {toast.body}
          </span>
          {!compact && (toast.link || toast.summaryCount) ? (
            <span className="mt-1 block text-[11px] font-semibold text-primary">
              {toast.summaryCount ? 'Tap to see them' : paused ? 'Open →' : 'Tap to open'}
            </span>
          ) : null}
        </span>
        {waiting > 0 ? (
          <span className="shrink-0 self-center whitespace-nowrap rounded-full bg-primary-50 px-2 py-0.5 text-[11px] font-semibold text-primary">
            +{waiting} more
          </span>
        ) : null}
      </button>
      <button
        type="button"
        className="absolute right-0.5 top-1/2 -translate-y-1/2 sm:right-1.5 sm:top-1.5 sm:translate-y-0 inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-xl text-ink-400 transition-colors duration-200 hover:bg-primary-50 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        aria-label="Dismiss notification"
        onClick={(e) => {
          e.stopPropagation()
          onDismiss()
        }}
      >
        <X className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
      </button>
      <div className={cn(compact ? 'h-0.5' : 'h-1', style.track)} aria-hidden>
        <div
          className={cn('h-full transition-[width] duration-75 ease-linear', style.bar)}
          style={{ width: `${progress * 100}%` }}
        />
      </div>
    </div>
  )
}

const TOAST_STYLES = {
  info: {
    label: 'Update',
    Icon: Bell,
    border: 'border-primary-100',
    shadow: 'shadow-primary-100/50',
    bar: 'bg-primary',
    track: 'bg-primary-50',
    iconWrap: 'bg-primary-50 text-primary',
    chip: 'bg-primary-50 text-primary',
  },
  success: {
    label: 'Created',
    Icon: CircleCheck,
    border: 'border-emerald-100',
    shadow: 'shadow-emerald-100/60',
    bar: 'bg-emerald-600',
    track: 'bg-emerald-50',
    iconWrap: 'bg-emerald-50 text-emerald-700',
    chip: 'bg-emerald-50 text-emerald-700',
  },
  warning: {
    label: 'Changed',
    Icon: CircleAlert,
    border: 'border-amber-200',
    shadow: 'shadow-amber-100/70',
    bar: 'bg-amber-500',
    track: 'bg-amber-50',
    iconWrap: 'bg-amber-50 text-amber-700',
    chip: 'bg-amber-50 text-amber-800',
  },
  pending: {
    label: 'Pending',
    Icon: CircleDot,
    border: 'border-amber-200',
    shadow: 'shadow-amber-100/70',
    bar: 'bg-amber-400',
    track: 'bg-amber-50',
    iconWrap: 'bg-amber-50 text-amber-600',
    chip: 'bg-amber-100 text-amber-800',
  },
  danger: {
    label: 'Deleted',
    Icon: Trash2,
    border: 'border-accent-100',
    shadow: 'shadow-accent-100/50',
    bar: 'bg-accent',
    track: 'bg-accent-50',
    iconWrap: 'bg-accent-50 text-accent',
    chip: 'bg-accent-50 text-accent-700',
  },
} as const
