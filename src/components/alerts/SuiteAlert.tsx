import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import { Button, cn } from '../ui'

const ICON_STROKE = 1.6

export type SuiteAlertTone = 'danger' | 'warning' | 'success' | 'info'

type ConfirmOptions = {
  title: string
  text: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: SuiteAlertTone
  icon?: 'trash' | 'warning' | 'ban'
}

type FeedbackOptions = {
  title: string
  text: string
  tone?: SuiteAlertTone
  autoCloseMs?: number
}

type SuiteAlertApi = {
  confirm: (options: ConfirmOptions) => Promise<boolean>
  confirmDelete: (options: Omit<ConfirmOptions, 'tone' | 'icon'>) => Promise<boolean>
  deleted: (options: FeedbackOptions) => Promise<void>
  success: (options: FeedbackOptions) => Promise<void>
}

type ActiveAlert =
  | {
      kind: 'confirm'
      options: ConfirmOptions
      resolve: (value: boolean) => void
    }
  | {
      kind: 'feedback'
      options: FeedbackOptions
      resolve: () => void
    }

const SuiteAlertContext = createContext<SuiteAlertApi | null>(null)

const ICONS: Record<NonNullable<ConfirmOptions['icon']>, LucideIcon> = {
  trash: Trash2,
  warning: AlertTriangle,
  ban: Ban,
}

const TONE_RING: Record<SuiteAlertTone, string> = {
  danger: 'bg-accent-50 text-accent ring-accent-100',
  warning: 'bg-amber-50 text-amber-700 ring-amber-100',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  info: 'bg-primary-50 text-primary ring-primary-100',
}

export function SuiteAlertProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<ActiveAlert | null>(null)
  const queueRef = useRef<ActiveAlert[]>([])

  const enqueue = useCallback((item: ActiveAlert) => {
    setActive((current) => {
      if (!current) return item
      queueRef.current.push(item)
      return current
    })
  }, [])

  const closeCurrent = useCallback(() => {
    setActive(null)
    queueMicrotask(() => {
      const next = queueRef.current.shift() ?? null
      if (next) setActive(next)
    })
  }, [])

  const api = useMemo<SuiteAlertApi>(
    () => ({
      confirm: (options) =>
        new Promise<boolean>((resolve) => {
          enqueue({
            kind: 'confirm',
            options: {
              tone: 'danger',
              icon: 'trash',
              confirmLabel: 'Delete',
              cancelLabel: 'Keep',
              ...options,
            },
            resolve,
          })
        }),
      confirmDelete: (options) =>
        new Promise<boolean>((resolve) => {
          enqueue({
            kind: 'confirm',
            options: {
              tone: 'danger',
              icon: 'trash',
              confirmLabel: 'Delete',
              cancelLabel: 'Keep',
              ...options,
            },
            resolve,
          })
        }),
      deleted: (options) =>
        new Promise<void>((resolve) => {
          enqueue({
            kind: 'feedback',
            options: {
              tone: 'success',
              autoCloseMs: 2200,
              ...options,
            },
            resolve,
          })
        }),
      success: (options) =>
        new Promise<void>((resolve) => {
          enqueue({
            kind: 'feedback',
            options: {
              tone: 'success',
              autoCloseMs: 2200,
              ...options,
            },
            resolve,
          })
        }),
    }),
    [enqueue],
  )

  return (
    <SuiteAlertContext.Provider value={api}>
      {children}
      {active &&
        createPortal(
          <SuiteAlertDialog
            active={active}
            onCancel={() => {
              if (active.kind === 'confirm') active.resolve(false)
              else active.resolve()
              closeCurrent()
            }}
            onConfirm={() => {
              if (active.kind === 'confirm') active.resolve(true)
              else active.resolve()
              closeCurrent()
            }}
          />,
          document.body,
        )}
    </SuiteAlertContext.Provider>
  )
}

export function useSuiteAlert() {
  const ctx = useContext(SuiteAlertContext)
  if (!ctx) throw new Error('useSuiteAlert must be used within SuiteAlertProvider')
  return ctx
}

function SuiteAlertDialog({
  active,
  onCancel,
  onConfirm,
}: {
  active: ActiveAlert
  onCancel: () => void
  onConfirm: () => void
}) {
  const tone: SuiteAlertTone =
    active.kind === 'confirm'
      ? (active.options.tone ?? 'danger')
      : (active.options.tone ?? 'success')

  const Icon =
    active.kind === 'feedback' ? CheckCircle2 : ICONS[active.options.icon ?? 'trash']

  const title = active.options.title
  const text = active.options.text
  const autoMs = active.kind === 'feedback' ? (active.options.autoCloseMs ?? 2200) : null

  useEffect(() => {
    if (autoMs == null) return
    const id = window.setTimeout(onConfirm, autoMs)
    return () => window.clearTimeout(id)
  }, [autoMs, onConfirm])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onCancel])

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Dismiss"
        className="absolute inset-0 cursor-pointer bg-ink/45 backdrop-blur-[3px] transition-opacity duration-200"
        onClick={onCancel}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="suite-alert-title"
        aria-describedby="suite-alert-text"
        className="relative w-full max-w-sm animate-suite-alert rounded-[1.75rem] border border-primary-100 bg-white px-6 pb-6 pt-8 shadow-xl shadow-ink/10"
      >
        <div className="flex flex-col items-center text-center">
          <span
            className={cn(
              'mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full ring-8',
              TONE_RING[tone],
            )}
          >
            <Icon className="h-8 w-8" strokeWidth={ICON_STROKE} aria-hidden />
          </span>
          <h2 id="suite-alert-title" className="font-display text-xl font-semibold text-ink">
            {title}
          </h2>
          <p id="suite-alert-text" className="mt-2 text-sm leading-relaxed text-ink-500">
            {text}
          </p>
        </div>

        {active.kind === 'confirm' ? (
          <div className="mt-6 grid grid-cols-2 gap-2">
            <Button variant="secondary" className="min-h-11 w-full" onClick={onCancel}>
              {active.options.cancelLabel ?? 'Keep'}
            </Button>
            <Button
              variant={tone === 'danger' ? 'danger' : 'primary'}
              className="min-h-11 w-full"
              onClick={onConfirm}
            >
              {active.options.confirmLabel ?? 'Confirm'}
            </Button>
          </div>
        ) : (
          <div className="mt-6">
            <Button className="min-h-11 w-full" onClick={onConfirm}>
              Done
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
