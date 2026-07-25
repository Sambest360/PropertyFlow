import { ChevronDown } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../../context/AuthContext'
import { roleLabels } from '../../lib/permissions'
import { cn } from '../ui'

export function RoleSwitcher({ variant = 'full' }: { variant?: 'full' | 'avatar' }) {
  const { user, roleLabel, roleBlurb, switchUser, usersForSwitcher } = useAuth()
  const [open, setOpen] = useState(false)
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const updatePosition = () => {
    const el = triggerRef.current
    if (!el) return
    const box = el.getBoundingClientRect()
    setMenuPos({
      top: box.bottom + 8,
      right: Math.max(8, window.innerWidth - box.right),
    })
  }

  useEffect(() => {
    if (!open) return
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
  }, [open])

  const grouped = useMemo(() => {
    const map = new Map<string, typeof usersForSwitcher>()
    for (const u of usersForSwitcher) {
      const key = roleLabels[u.role]
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(u)
    }
    return [...map.entries()]
  }, [usersForSwitcher])

  const initials = user.name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)

  const menu = open
    ? createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label="Account switcher"
          className="fixed z-[90] max-h-[min(24rem,calc(100vh-5rem))] w-80 overflow-y-auto rounded-2xl border border-primary-100 bg-white py-2 shadow-xl shadow-ink/15 animate-fade-in"
          style={{ top: menuPos.top, right: menuPos.right }}
        >
          <div className="border-b border-primary-100 px-3 pb-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">Signed in</p>
            <p className="mt-0.5 text-sm font-semibold text-ink">{user.name}</p>
            <p className="text-[11px] text-ink-500">{roleBlurb}</p>
            <p className="mt-2 text-[11px] text-ink-500">
              Switching users changes your dashboard, sidebar, and permissions instantly.
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
                    'flex w-full cursor-pointer flex-col px-3 py-2 text-left text-sm transition-colors duration-200 hover:bg-primary-50',
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
          className="inline-flex h-11 w-11 cursor-pointer items-center justify-center overflow-hidden rounded-2xl bg-primary text-xs font-bold text-white shadow-sm transition-opacity duration-200 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          {user.avatar ? (
            <img src={user.avatar} alt="" className="h-full w-full object-cover" />
          ) : (
            initials
          )}
        </button>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          aria-expanded={open}
          aria-haspopup="menu"
          onClick={() => setOpen((o) => !o)}
          className="flex min-h-11 max-w-[220px] cursor-pointer items-center gap-2 rounded-full border border-primary-100 bg-white px-1.5 py-1 text-left shadow-sm transition-colors duration-200 hover:border-primary-200 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white">
            {initials}
          </span>
          <span className="min-w-0 hidden sm:block">
            <span className="block truncate text-xs font-semibold text-ink">{user.name}</span>
            <span className="block truncate text-[10px] text-ink-500">{roleLabel}</span>
          </span>
          <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-ink-500 transition', open && 'rotate-180')} />
        </button>
      )}
      {menu}
    </div>
  )
}
