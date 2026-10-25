import {
  CalendarDays,
  ChevronDown,
  FileText,
  Heart,
  HelpCircle,
  Home,
  KeyRound,
  LayoutDashboard,
  Lightbulb,
  LogOut,
  MessageSquare,
  MessageSquareText,
  PenLine,
  Settings,
  UserRound,
  Wallet,
  Wrench,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useStore } from '../../context/AppStore'
import { signOutAndRedirect } from '../../lib/auth/signOut'
import { ACCOUNT_PASSWORD_PATH, ACCOUNT_SIGNATURE_PATH, ACCOUNT_WISHLIST_PATH } from '../../lib/accountRoutes'
import { isApiEnabled } from '../../lib/api/config'
import { arePageTipsDisabled, resetPageTipsForUser, setPageTipsPreference } from '../../lib/pageTips'
import { resolveWorkflowStatus } from '../../lib/applicationWorkflow'
import { roleLabels } from '../../lib/permissions'
import type { Permission, Role } from '../../types/domain'
import { cn } from '../ui'

const ICON_STROKE = 1.6
const MENU_WIDTH_PX = 300
const MENU_GAP_PX = 8
const VIEWPORT_PAD_PX = 8

type MenuLink = { label: string; to: string; icon: typeof LayoutDashboard; count?: number }
type MenuSection = { title: string; items: MenuLink[] }

const TENANT_PORTAL = '/workspace/portals/tenant'
/** Applications that no longer need the tenant (not counted in the menu). */
const ENDED_APPLICATION_STATUSES = new Set<string>(['rejected', 'cancelled', 'withdrawn', 'closed', 'deposit_refunded'])

/**
 * Shortcuts for the signed-in role: portal users get the pages they use
 * (with counts that need attention), staff get their workspace.
 */
export function shortcutSections(input: {
  role: Role
  userId: string
  has: (p: Permission) => boolean
  hasAny: (p: Permission[]) => boolean
  counts?: { applications: number; viewings: number; paymentsDue: number }
}): MenuSection[] {
  const { role, userId, has, hasAny, counts } = input
  if (role === 'tenant' && has('portal.tenant')) {
    return [
      {
        title: 'My home search',
        items: [
          { label: 'Overview', to: TENANT_PORTAL, icon: LayoutDashboard },
          { label: 'Applications', to: `${TENANT_PORTAL}/applications`, icon: FileText, count: counts?.applications },
          { label: 'Viewings', to: `${TENANT_PORTAL}/viewings`, icon: CalendarDays, count: counts?.viewings },
          { label: 'Enquiries', to: `${TENANT_PORTAL}/enquiries`, icon: MessageSquareText },
          { label: 'Payments', to: `${TENANT_PORTAL}/payments`, icon: Wallet, count: counts?.paymentsDue },
          { label: 'Maintenance', to: `${TENANT_PORTAL}/maintenance`, icon: Wrench },
          { label: 'Messages', to: `${TENANT_PORTAL}/messages`, icon: MessageSquare },
          { label: 'Saved homes', to: ACCOUNT_WISHLIST_PATH, icon: Heart },
          { label: 'Browse homes', to: '/browse', icon: Home },
        ],
      },
    ]
  }
  if (role === 'landlord' && has('portal.owner')) {
    return [{ title: 'Go to', items: [{ label: 'Owner portal', to: '/workspace/portals/owner', icon: LayoutDashboard }] }]
  }
  if (role === 'contractor' && has('portal.contractor')) {
    return [{ title: 'Go to', items: [{ label: 'My jobs', to: '/workspace/portals/contractor', icon: Wrench }] }]
  }
  const items: MenuLink[] = [{ label: 'Dashboard', to: '/workspace', icon: LayoutDashboard }]
  if (has('roles.assign')) items.push({ label: 'My profile', to: `/workspace/admin/users/${userId}`, icon: UserRound })
  if (hasAny(['users.manage', 'roles.assign', 'config.manage', 'tenant.manage', 'platform.manage'])) {
    items.push({ label: 'Administration', to: '/workspace/admin', icon: Settings })
  }
  return [{ title: 'Go to', items }]
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
  const [open, setOpen] = useState(false)
  const [pageTipsOff, setPageTipsOff] = useState(() => arePageTipsDisabled(user.id))
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0, maxHeight: 560 })
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
    const maxHeight = Math.min(560, Math.max(160, preferBelow ? spaceBelow : spaceAbove))
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

  const { state } = useStore()
  const tenantCounts = useMemo(() => {
    if (!open || user.role !== 'tenant') return undefined
    const email = user.email?.toLowerCase()
    const today = new Date().toISOString().slice(0, 10)
    const mine = (e?: string | null) => Boolean(email) && e?.toLowerCase() === email
    return {
      applications: state.applications.filter(
        (a) =>
          (a.applicantUserId === user.id || mine(a.email)) &&
          !ENDED_APPLICATION_STATUSES.has(resolveWorkflowStatus(a)),
      ).length,
      viewings: state.viewings.filter(
        (v) => v.status === 'Scheduled' && v.date >= today && (mine(v.applicantEmail) || v.applicantName === user.name),
      ).length,
      paymentsDue: state.payments.filter(
        (p) => p.partyUserId === user.id && (p.status === 'Due' || p.status === 'Overdue'),
      ).length,
    }
  }, [open, user.role, user.id, user.email, user.name, state.applications, state.viewings, state.payments])

  const sections = useMemo(
    () => shortcutSections({ role: user.role, userId: user.id, has, hasAny, counts: tenantCounts }),
    [user.role, user.id, has, hasAny, tenantCounts],
  )

  const accountLinks: MenuLink[] = [
    { label: 'My signature', to: ACCOUNT_SIGNATURE_PATH, icon: PenLine },
    // D3: own password change (API mode; the route needs a server session).
    ...(isApiEnabled && !isImpersonating
      ? [{ label: 'Change password', to: ACCOUNT_PASSWORD_PATH, icon: KeyRound }]
      : []),
    { label: 'Help & support', to: '/workspace/help', icon: HelpCircle },
  ]

  const togglePageTips = () => {
    if (pageTipsOff) {
      resetPageTipsForUser(user.id)
      setPageTipsOff(false)
    } else {
      setPageTipsPreference(user.id, true)
      setPageTipsOff(true)
    }
  }

  const linkClass =
    'flex min-h-10 cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium text-ink transition-colors duration-200 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary'

  const renderLink = (item: MenuLink) => {
    const Icon = item.icon
    return (
      <Link
        key={item.to + item.label}
        to={item.to}
        role="menuitem"
        onClick={() => setOpen(false)}
        className={linkClass}
      >
        <Icon className="h-4 w-4 shrink-0 text-ink-400" strokeWidth={ICON_STROKE} aria-hidden />
        <span className="flex-1">{item.label}</span>
        {item.count ? (
          <span className="tabular min-w-5 rounded-full bg-primary px-1.5 text-center text-[11px] font-semibold leading-5 text-white">
            {item.count}
          </span>
        ) : null}
      </Link>
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
          aria-label="Account menu"
          className="fixed z-[100] flex flex-col overflow-hidden rounded-2xl border border-primary-100 bg-white shadow-xl shadow-ink/15 animate-fade-in"
          style={{
            top: menuPos.top,
            right: menuPos.right,
            width: MENU_WIDTH_PX,
            maxWidth: `calc(100vw - ${VIEWPORT_PAD_PX * 2}px)`,
            maxHeight: menuPos.maxHeight,
          }}
        >
          <div className="flex items-center gap-3 border-b border-primary-100 px-4 py-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary text-sm font-bold text-white">
              {user.avatar ? <img src={user.avatar} alt="" className="h-full w-full object-cover" /> : initials}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{user.name}</p>
              <p className="truncate text-xs text-primary">{roleLabel}</p>
              {user.email ? <p className="truncate text-xs text-ink-400">{user.email}</p> : null}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto pb-2">
          {demoSwitcherEnabled ? <p className="px-4 pt-2 text-[11px] text-ink-500">{roleBlurb}</p> : null}

          {sections.map((section) => (
            <div key={section.title} className="px-2 pt-2">
              <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-400">
                {section.title}
              </p>
              {section.items.map(renderLink)}
            </div>
          ))}

          <div className="mx-2 mt-2 border-t border-primary-100 pt-2">
            <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-400">Account</p>
            {accountLinks.map(renderLink)}
            {!isImpersonating ? (
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={!pageTipsOff}
                onClick={togglePageTips}
                className={cn(linkClass, 'w-full text-left')}
              >
                <Lightbulb className="h-4 w-4 shrink-0 text-ink-400" strokeWidth={ICON_STROKE} aria-hidden />
                <span className="flex-1">Page tips</span>
                <span
                  aria-hidden
                  className={cn(
                    'relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200',
                    pageTipsOff ? 'bg-ink-200' : 'bg-primary',
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all duration-200',
                      pageTipsOff ? 'left-0.5' : 'left-[18px]',
                    )}
                  />
                </span>
              </button>
            ) : null}
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
          </div>
          <div className="border-t border-primary-100 p-2">
            {isImpersonating ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  stopImpersonation()
                  setOpen(false)
                }}
                className={cn(linkClass, 'w-full text-left')}
              >
                <UserRound className="h-4 w-4 shrink-0 text-ink-400" strokeWidth={ICON_STROKE} aria-hidden />
                Stop impersonating
              </button>
            ) : null}
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                void signOutAndRedirect(logout)
              }}
              className={cn(linkClass, 'w-full text-left text-accent-600 hover:bg-accent-50')}
            >
              <LogOut className="h-4 w-4 shrink-0 text-accent-500" strokeWidth={ICON_STROKE} aria-hidden />
              Sign out
            </button>
          </div>
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
