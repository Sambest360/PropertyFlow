import { ChevronDown, HelpCircle, Home, KeyRound, LayoutDashboard, LogOut, PenLine, UserRound } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { signOutAndRedirect } from '../../lib/auth/signOut'
import { ACCOUNT_PASSWORD_PATH, ACCOUNT_SIGNATURE_PATH } from '../../lib/accountRoutes'
import { isApiEnabled } from '../../lib/api/config'
import { arePageTipsDisabled, resetPageTipsForUser, setPageTipsPreference } from '../../lib/pageTips'
import { roleLabels } from '../../lib/permissions'
import type { Permission, Role } from '../../types/domain'
import { cn } from '../ui'

const ICON_STROKE = 1.6
const MENU_WIDTH_PX = 320
const MENU_GAP_PX = 8
const VIEWPORT_PAD_PX = 8

type MenuItem =
  | { kind: 'link'; label: string; to: string; icon: typeof LayoutDashboard }
  | { kind: 'action'; label: string; onClick: () => void; icon: typeof LogOut; destructive?: boolean }

function portalPath(role: Role, has: (p: Permission) => boolean): string | null {
  if (role === 'tenant' && has('portal.tenant')) return '/workspace/portals/tenant'
  if (role === 'contractor' && has('portal.contractor')) return '/workspace/portals/contractor'
  if (role === 'landlord' && has('portal.owner')) return '/workspace/portals/owner'
  return null
}

export function RoleSwitcher({ variant = 'full' }: { variant?: 'full' | 'avatar' }) {
  const {
    user,
    roleLabel,
    roleBlurb,
    switchUser,
    usersForSwitcher,
    demoSwitcherEnabled,
    logout,
    has,
    hasAny,
    isImpersonating,
    stopImpersonation,
  } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [pageTipsOff, setPageTipsOff] = useState(() => arePageTipsDisabled(user.id))
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
    setPageTipsOff(arePageTipsDisabled(user.id))
  }, [user.id])

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

  const menuItems = useMemo((): MenuItem[] => {
    const items: MenuItem[] = [{ kind: 'link', label: 'Dashboard', to: '/workspace', icon: LayoutDashboard }]

    const portal = portalPath(user.role, has)
    if (portal) {
      items.push({ kind: 'link', label: 'My portal', to: portal, icon: UserRound })
    } else if (has('roles.assign')) {
      items.push({
        kind: 'link',
        label: 'My profile',
        to: `/workspace/admin/users/${user.id}`,
        icon: UserRound,
      })
    }

    items.push({ kind: 'link', label: 'My signature', to: ACCOUNT_SIGNATURE_PATH, icon: PenLine })

    if (
      hasAny([
        'users.manage',
        'roles.assign',
        'config.manage',
        'tenant.manage',
        'platform.manage',
      ])
    ) {
      items.push({ kind: 'link', label: 'Administration', to: '/workspace/admin', icon: LayoutDashboard })
    }

    if (!isImpersonating) {
      items.push({
        kind: 'action',
        label: pageTipsOff ? 'Show page tips' : 'Turn off page tips',
        icon: HelpCircle,
        onClick: () => {
          if (pageTipsOff) {
            resetPageTipsForUser(user.id)
            setPageTipsOff(false)
          } else {
            setPageTipsPreference(user.id, true)
            setPageTipsOff(true)
          }
          setOpen(false)
        },
      })
    }

    // D3: own password change (API mode; the route needs a server session).
    if (isApiEnabled && !isImpersonating) {
      items.push({ kind: 'link', label: 'Change password', to: ACCOUNT_PASSWORD_PATH, icon: KeyRound })
    }

    items.push(
      { kind: 'link', label: 'Browse homes', to: '/browse', icon: Home },
      { kind: 'link', label: 'Help & support', to: '/workspace/help', icon: HelpCircle },
    )

    if (isImpersonating) {
      items.push({
        kind: 'action',
        label: 'Stop impersonating',
        icon: UserRound,
        onClick: () => {
          stopImpersonation()
          setOpen(false)
        },
      })
    }

    items.push({
      kind: 'action',
      label: 'Sign out',
      icon: LogOut,
      destructive: true,
      onClick: () => {
        setOpen(false)
        void signOutAndRedirect(logout)
      },
    })

    return items
  }, [user.id, user.role, has, hasAny, isImpersonating, stopImpersonation, logout, navigate, pageTipsOff])

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
          aria-label="Account menu"
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
            <p className="text-[11px] text-ink-500">{roleLabel}</p>
            {user.email ? <p className="mt-0.5 truncate text-[11px] text-ink-400">{user.email}</p> : null}
            {demoSwitcherEnabled ? (
              <p className="mt-2 text-[11px] text-ink-500">{roleBlurb}</p>
            ) : null}
          </div>

          <div className="py-1">
            {menuItems.map((item) => {
              const Icon = item.icon
              if (item.kind === 'link') {
                return (
                  <Link
                    key={item.to + item.label}
                    to={item.to}
                    role="menuitem"
                    onClick={() => setOpen(false)}
                    className="flex min-h-11 cursor-pointer items-center gap-2.5 px-3 py-2 text-sm font-medium text-ink transition-colors duration-200 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-ink-400" strokeWidth={ICON_STROKE} aria-hidden />
                    {item.label}
                  </Link>
                )
              }
              return (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  onClick={item.onClick}
                  className={cn(
                    'flex min-h-11 w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left text-sm font-medium transition-colors duration-200 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
                    item.destructive ? 'text-accent-600 hover:bg-accent-50' : 'text-ink',
                  )}
                >
                  <Icon
                    className={cn('h-4 w-4 shrink-0', item.destructive ? 'text-accent-500' : 'text-ink-400')}
                    strokeWidth={ICON_STROKE}
                    aria-hidden
                  />
                  {item.label}
                </button>
              )
            })}
          </div>

          {demoSwitcherEnabled ? (
            <>
              <div className="border-t border-primary-100 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">
                  Switch demo user
                </p>
                <p className="mt-1 text-[11px] text-ink-500">
                  Changes sidebar and permissions for the same shared views.
                </p>
              </div>
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
            </>
          ) : null}
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
