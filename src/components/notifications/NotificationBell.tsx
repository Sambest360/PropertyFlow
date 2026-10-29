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
        <Bell className="h-5 w-5" strokeWidth={ICON_STROKE} aria-hidden />
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
  const mine = toasts.filter((t) => {
    if (t.userId !== user.id) return false
    const source = state.notifications.find((n) => n.id === t.notificationId)
    return showsInApp(prefs, source?.resource)
  })

  return (
    <div
      className="pointer-events-none fixed right-3 top-3 z-[70] flex w-[min(22rem,calc(100vw-1.5rem))] flex-col gap-2 sm:right-5 sm:top-4"
      aria-live="polite"
    >
      {mine.map((toast) => (
        <ToastCard
          key={toast.id}
          toast={toast}
          onDismiss={() => dismissToast(toast.id)}
          onOpen={() => {
            markNotificationRead(toast.notificationId)
            dismissToast(toast.id)
            if (toast.link) navigate(toast.link)
          }}
        />
      ))}
    </div>
  )
}

function ToastCard({
  toast,
  onDismiss,
  onOpen,
}: {
  toast: NotificationToast
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
        className="flex w-full cursor-pointer gap-3 py-3 pl-4 pr-12 text-left transition-colors duration-200 hover:bg-primary-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
        onClick={onOpen}
      >
        <span
          className={cn(
            'mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
            style.iconWrap,
          )}
        >
          <Icon className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink">{toast.title}</span>
          <span className="mt-0.5 block text-xs text-ink-500 line-clamp-2">{toast.body}</span>
          {toast.link ? (
            <span className="mt-1 block text-[11px] font-semibold text-primary">
              {paused ? 'Open →' : 'Tap to open'}
            </span>
          ) : null}
        </span>
      </button>
      <button
        type="button"
        className="absolute right-1.5 top-1.5 inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-xl text-ink-400 transition-colors duration-200 hover:bg-primary-50 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        aria-label="Dismiss reminder"
        onClick={(e) => {
          e.stopPropagation()
          onDismiss()
        }}
      >
        <X className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
      </button>
      <div className={cn('h-1', style.track)} aria-hidden>
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
