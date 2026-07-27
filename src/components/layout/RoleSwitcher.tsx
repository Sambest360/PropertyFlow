import { ChevronDown } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../../context/AuthContext'
import { roleLabels } from '../../lib/permissions'
import { cn } from '../ui'

const ICON_STROKE = 1.6
const MENU_WIDTH_PX = 320
const MENU_GAP_PX = 8
const VIEWPORT_PAD_PX = 8

export function RoleSwitcher({ variant = 'full' }: { variant?: 'full' | 'avatar' }) {
  const { user, roleLabel, roleBlurb, switchUser, usersForSwitcher, demoSwitcherEnabled, logout } =
    useAuth()
  const [open, setOpen] = useState(false)
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0, maxHeight: 384 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const updatePosition = () => {
    const el = triggerRef.current
    if (!el) return
    const box = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const right = Math.max(VIEWPORT_PAD_PX, vw - box.right)
    const spaceBelow = vh - box.bottom - MENU_GAP_PX - VIEWPORT_PAD_PX
    const spaceAbove = box.top - MENU_GAP_PX - VIEWPORT_PAD_PX
    const preferBelow = spaceBelow >= 160 || spaceBelow >= spaceAbove
    const maxHeight = Math.min(384, Math.max(160, preferBelow ? spaceBelow : spaceAbove))
    const top = preferBelow
      ? box.bottom + MENU_GAP_PX
      : Math.max(VIEWPORT_PAD_PX, box.top - MENU_GAP_PX - maxHeight)
    setMenuPos({ top, right, maxHeight })
  }

  useEffect(() => {
    if (!open || !demoSwitcherEnabled) return
    updatePosition()
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false)
    }
    const onReposition = () => updatePosition()
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('resize', onReposition)
    window.addEventListener('scroll', onReposition, true)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('resize', onReposition)
      window.removeEventListener('scroll', onReposition, true)
    }
  }, [open, demoSwitcherEnabled])

  const grouped = useMemo(() => {
    const map = new Map<string, typeof usersForSwitcher>()
    for (const u of usersForSwitcher) {
      const key = roleLabels[u.role]
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(u)
    }
    return [...map.entries()]
  }, [usersForSwitcher])

  if (!demoSwitcherEnabled) {
    if (variant === 'avatar') {
      return (
        <button
          type="button"
          onClick={() => void logout()}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold text-primary"
          title={`${user.name} — sign out`}
        >
          {user.name
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((p) => p[0]?.toUpperCase() ?? '')
            .join('') || '?'}
        </button>
      )
    }
    return (
      <div className="rounded-2xl border border-primary-100 px-3 py-2 text-sm">
        <p className="font-semibold text-ink">{user.name}</p>
        <p className="text-ink-500">{roleLabel}</p>
        <button
          type="button"
          className="mt-2 text-xs font-semibold text-primary hover:underline"
          onClick={() => void logout()}
        >
          Sign out
        </button>
      </div>
    )
  }
  const initials =
    user.name
      .replace(/\([^)]*\)/g, '')
      .split(/\s+/)
      .filter(Boolean)
      .map((p) => p[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || '?'

  const menu = open
    ? createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label="Account switcher"
          className="fixed z-[100] overflow-y-auto rounded-2xl border border-primary-100 bg-white py-2 shadow-xl shadow-ink/15 animate-fade-in"
          style={{
            top: menuPos.top,
            right: menuPos.right,
            width: MENU_WIDTH_PX,
            maxWidth: `calc(100vw - ${VIEWPORT_PAD_PX * 2}px)`,
            maxHeight: menuPos.maxHeight,
          }}
        >
          <div className="border-b border-primary-100 px-3 pb-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">Signed in</p>
            <p className="mt-0.5 text-sm font-semibold text-ink">{user.name}</p>
            <p className="text-[11px] text-ink-500">{roleBlurb}</p>
            <p className="mt-2 text-[11px] text-ink-500">
              Switching users changes sidebar and permissions for the same shared views.
            </p>
          </div>
          <p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-ink-400">
            Switch demo user
          </p>
          {grouped.map(([role, users]) => (
            <div key={role} className="mb-1">
              <p className="px-3 py-1 text-[10px] font-semibold text-ink-400">{role}</p>
              {users.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    switchUser(u.id)
                    setOpen(false)
                  }}
                  className={cn(
                    'flex min-h-11 w-full cursor-pointer flex-col justify-center px-3 py-2 text-left text-sm transition-colors duration-200 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
                    u.id === user.id && 'bg-primary-50',
                  )}
                >
                  <span className="font-medium text-ink">{u.name}</span>
                  <span className="text-[11px] text-ink-500">{u.email}</span>
                </button>
              ))}
            </div>
          ))}
        </div>,
        document.body,
      )
    : null

  const avatarCircle = (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary text-[11px] font-bold text-white">
      {user.avatar ? (
        <img src={user.avatar} alt="" className="h-full w-full object-cover" />
      ) : (
        initials
      )}
    </span>
  )

  return (
    <div className="relative">
      {variant === 'avatar' ? (
        <button
          ref={triggerRef}
          type="button"
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={`Account: ${user.name}`}
          onClick={() => setOpen((o) => !o)}
          className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-primary-100 bg-white py-1 pl-1.5 pr-2.5 shadow-sm transition-colors duration-200 hover:border-primary-200 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          {avatarCircle}
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 shrink-0 text-ink-500 transition-transform duration-200',
              open && 'rotate-180',
            )}
            strokeWidth={ICON_STROKE}
            aria-hidden
          />
        </button>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={`Account: ${user.name}`}
          onClick={() => setOpen((o) => !o)}
          className="flex min-h-11 w-full max-w-[240px] cursor-pointer items-center gap-2 rounded-full border border-primary-100 bg-white py-1 pl-1.5 pr-2.5 text-left shadow-sm transition-colors duration-200 hover:border-primary-200 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {avatarCircle}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-semibold text-ink">{user.name}</span>
            <span className="block truncate text-[10px] text-ink-500">{roleLabel}</span>
          </span>
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 shrink-0 text-ink-500 transition-transform duration-200',
              open && 'rotate-180',
            )}
            strokeWidth={ICON_STROKE}
            aria-hidden
          />
        </button>
      )}
      {menu}
    </div>
  )
}
