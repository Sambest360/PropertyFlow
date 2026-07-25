import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronDown,
  CircleHelp,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react'
import { BrandLogo } from './BrandLogo'
import { cn } from '../ui'
import {
  filterWorkspaceNav,
  flattenNavLinks,
  getWorkspaceNav,
  pathMatches,
  type FlatNavItem,
  type NavGroup,
  type WorkspaceNavEntry,
} from './navigation'
import { useAuth } from '../../context/AuthContext'
import { usePrefersReducedMotion } from '../../hooks/useScrollMotion'
import { useNavCollapsed } from '../../hooks/useNavCollapsed'

const ICON_STROKE = 1.6
/** How far the active pill overlaps past the sidebar edge into the page */
const ACTIVE_OVERLAP_PX = 10

export function useWorkspaceNav(): WorkspaceNavEntry[] {
  const { role, has, hasAny } = useAuth()
  return useMemo(() => filterWorkspaceNav(getWorkspaceNav(role), has, hasAny), [role, has, hasAny])
}

function NavItemLink({
  item,
  active,
  collapsed,
  onNavigate,
  itemRef,
  rail,
  nested,
}: {
  item: FlatNavItem
  active: boolean
  collapsed?: boolean
  onNavigate?: () => void
  itemRef?: (el: HTMLAnchorElement | null) => void
  rail?: boolean
  nested?: boolean
}) {
  const Icon = item.icon
  return (
    <Link
      ref={itemRef}
      to={item.to}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative z-[1] flex min-h-11 cursor-pointer items-center gap-3.5 text-[0.9375rem] font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        rail
          ? cn(
              'mx-auto justify-center rounded-2xl px-0 py-2.5 focus-visible:ring-white/80',
              collapsed ? 'h-11 w-11' : 'w-full pl-5 pr-4',
              active ? 'bg-white/15 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white',
            )
          : cn(
              'focus-visible:ring-primary',
              collapsed ? 'justify-center px-0 py-2.5' : nested ? 'py-2 pl-11 pr-4' : 'py-2.5 pl-5 pr-4',
              active ? 'text-primary' : 'text-ink-400 hover:text-ink-600',
            ),
      )}
    >
      <Icon
        className={cn(
          'h-5 w-5 shrink-0 transition-colors duration-200',
          nested && !rail && 'h-4 w-4',
          rail
            ? active
              ? 'text-white'
              : 'text-white/75 group-hover:text-white'
            : active
              ? 'text-primary'
              : 'text-ink-400 group-hover:text-ink-500',
        )}
        strokeWidth={ICON_STROKE}
        aria-hidden
      />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  )
}

function NavGroupBlock({
  group,
  pathname,
  rail,
  open,
  onToggle,
  onNavigate,
  itemRef,
  flyoutOpen,
  onFlyoutToggle,
  reducedMotion = false,
}: {
  group: NavGroup
  pathname: string
  collapsed?: boolean
  rail?: boolean
  open: boolean
  onToggle: () => void
  onNavigate?: () => void
  itemRef?: (to: string, el: HTMLAnchorElement | null) => void
  flyoutOpen?: boolean
  onFlyoutToggle?: () => void
  reducedMotion?: boolean
}) {
  const GroupIcon = group.icon
  const childActive = group.children.some((c) => pathMatches(pathname, c.to, c.end))
  const flyoutRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!flyoutOpen) return
    const onDoc = (e: MouseEvent) => {
      if (flyoutRef.current && !flyoutRef.current.contains(e.target as Node)) {
        onFlyoutToggle?.()
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [flyoutOpen, onFlyoutToggle])

  if (rail) {
    return (
      <div className="relative" ref={flyoutRef}>
        <button
          type="button"
          title={group.label}
          aria-expanded={flyoutOpen}
          aria-haspopup="menu"
          onClick={onFlyoutToggle}
          className={cn(
            'mx-auto flex h-11 w-11 cursor-pointer items-center justify-center rounded-2xl transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80',
            childActive || flyoutOpen
              ? 'bg-white/15 text-white'
              : 'text-white/70 hover:bg-white/10 hover:text-white',
          )}
        >
          <GroupIcon className="h-5 w-5" strokeWidth={ICON_STROKE} aria-hidden />
        </button>
        {flyoutOpen && (
          <div
            role="menu"
            className="absolute left-full top-0 z-50 ml-2 min-w-[13.5rem] overflow-hidden rounded-2xl border border-primary-100 bg-white py-1.5 shadow-xl shadow-ink/15 animate-fade-in"
          >
            <p className="px-3 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wide text-ink-400">
              {group.label}
            </p>
            {group.children.map((child) => {
              const active = pathMatches(pathname, child.to, child.end)
              const Icon = child.icon
              return (
                <Link
                  key={child.to}
                  role="menuitem"
                  to={child.to}
                  onClick={onNavigate}
                  className={cn(
                    'flex min-h-11 cursor-pointer items-center gap-3 px-3 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                    active ? 'bg-primary-50 text-primary' : 'text-ink-600 hover:bg-primary-50/70',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" strokeWidth={ICON_STROKE} aria-hidden />
                  {child.label}
                </Link>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className={cn(
          'group relative z-[1] flex min-h-11 w-full cursor-pointer items-center gap-3.5 py-2.5 pl-5 pr-4 text-left text-[0.9375rem] font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          childActive || open ? 'text-primary' : 'text-ink-500 hover:text-ink-700',
        )}
      >
        <GroupIcon
          className={cn(
            'h-5 w-5 shrink-0',
            childActive || open ? 'text-primary' : 'text-ink-400 group-hover:text-ink-500',
          )}
          strokeWidth={ICON_STROKE}
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate">{group.label}</span>
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-ink-400 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
            open && 'rotate-180',
            reducedMotion && 'transition-none',
          )}
          strokeWidth={ICON_STROKE}
          aria-hidden
        />
      </button>
      <div
        className={cn(
          'grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
          reducedMotion && 'transition-none',
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div
            className={cn(
              'space-y-0.5 pb-1 transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
              open ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-1 opacity-0',
              reducedMotion && 'translate-y-0 transition-none',
            )}
            role="group"
            aria-label={group.label}
            aria-hidden={!open}
          >
            {group.children.map((child) => (
              <NavItemLink
                key={child.to}
                item={child}
                nested
                active={pathMatches(pathname, child.to, child.end)}
                onNavigate={onNavigate}
                itemRef={(el) => itemRef?.(child.to, el)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function WorkspaceNavBar({ items }: { items: WorkspaceNavEntry[] }) {
  const { pathname } = useLocation()
  const [openId, setOpenId] = useState<string | null>(null)
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) setOpenId(null)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  useEffect(() => setOpenId(null), [pathname])

  return (
    <nav className="border-t border-primary-100/80 bg-white" aria-label="Workspace" ref={barRef}>
      <div className="flex items-center gap-0.5 overflow-x-auto px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((entry) => {
          if (entry.type === 'link') {
            const item = entry.item
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                    isActive
                      ? 'bg-primary-50 text-primary'
                      : 'text-ink-400 hover:bg-primary-50/60 hover:text-ink-600',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      className={cn('h-4 w-4', isActive ? 'text-primary' : 'text-ink-400')}
                      strokeWidth={ICON_STROKE}
                      aria-hidden
                    />
                    {item.label}
                  </>
                )}
              </NavLink>
            )
          }

          const { group } = entry
          const GroupIcon = group.icon
          const active = group.children.some((c) => pathMatches(pathname, c.to, c.end))
          const open = openId === group.id

          return (
            <div key={group.id} className="relative shrink-0">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpenId(open ? null : group.id)}
                className={cn(
                  'inline-flex min-h-11 cursor-pointer items-center gap-2 whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  open || active
                    ? 'bg-primary-50 text-primary'
                    : 'text-ink-400 hover:bg-primary-50/60 hover:text-ink-600',
                )}
              >
                <GroupIcon className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                {group.label.replace(' Management', '')}
                <ChevronDown
                  className={cn('h-3.5 w-3.5 transition-transform duration-200', open && 'rotate-180')}
                  strokeWidth={ICON_STROKE}
                  aria-hidden
                />
              </button>
              {open && (
                <div className="absolute left-0 top-full z-50 mt-1 min-w-[12.5rem] overflow-hidden rounded-2xl border border-primary-100 bg-white py-1 shadow-lg shadow-ink/10 animate-fade-in">
                  {group.children.map((child) => {
                    const Icon = child.icon
                    const isActive = pathMatches(pathname, child.to, child.end)
                    return (
                      <Link
                        key={child.to}
                        to={child.to}
                        className={cn(
                          'flex min-h-11 cursor-pointer items-center gap-2.5 px-3 text-sm font-medium transition-colors duration-150',
                          isActive ? 'bg-primary-50 text-primary' : 'text-ink-600 hover:bg-primary-50/70',
                        )}
                      >
                        <Icon className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                        {child.label}
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </nav>
  )
}

export function WorkspaceMobileNav({
  items,
  onNavigate,
}: {
  items: WorkspaceNavEntry[]
  onNavigate: () => void
}) {
  const { pathname } = useLocation()
  const reducedMotion = usePrefersReducedMotion()
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    const activeGroup = items.find(
      (entry) =>
        entry.type === 'group' &&
        entry.group.children.some((c) => pathMatches(pathname, c.to, c.end)),
    )
    setOpenId(activeGroup?.type === 'group' ? activeGroup.group.id : null)
  }, [pathname, items])

  return (
    <div className="space-y-0.5">
      {items.map((entry) => {
        if (entry.type === 'link') {
          return (
            <NavItemLink
              key={entry.item.to}
              item={entry.item}
              active={pathMatches(pathname, entry.item.to, entry.item.end)}
              onNavigate={onNavigate}
            />
          )
        }
        return (
          <NavGroupBlock
            key={entry.group.id}
            group={entry.group}
            pathname={pathname}
            open={openId === entry.group.id}
            reducedMotion={reducedMotion}
            onToggle={() =>
              setOpenId((current) => (current === entry.group.id ? null : entry.group.id))
            }
            onNavigate={onNavigate}
          />
        )
      })}
    </div>
  )
}

/** Full-height admin sidebar — sliding active pill overlaps slightly into the page */
export function WorkspaceSidebar({
  items,
  chromeHidden = false,
  brandMuted = false,
}: {
  items: WorkspaceNavEntry[]
  /** Auto-hide while scrolling down the page */
  chromeHidden?: boolean
  /** Soften the PropertyFlow wordmark while scrolled */
  brandMuted?: boolean
}) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const reducedMotion = usePrefersReducedMotion()
  const navRef = useRef<HTMLElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Map<string, HTMLAnchorElement>>(new Map())
  const [pill, setPill] = useState({ top: 0, height: 44, ready: false })
  const [collapsed, setCollapsed] = useNavCollapsed()
  const [openId, setOpenId] = useState<string | null>(null)
  const [flyoutId, setFlyoutId] = useState<string | null>(null)
  const rail = collapsed
  const flatLinks = useMemo(() => flattenNavLinks(items), [items])

  const activeItem = flatLinks.find((item) => pathMatches(pathname, item.to, item.end))

  useEffect(() => {
    const activeGroup = items.find(
      (entry) =>
        entry.type === 'group' &&
        entry.group.children.some((c) => pathMatches(pathname, c.to, c.end)),
    )
    setOpenId(activeGroup?.type === 'group' ? activeGroup.group.id : null)
    setFlyoutId(null)
  }, [pathname, items])

  const updatePill = () => {
    if (rail) {
      setPill((p) => ({ ...p, ready: false }))
      return
    }
    const el = activeItem ? itemRefs.current.get(activeItem.to) : null
    const list = listRef.current
    const nav = navRef.current
    if (!el || !list || !nav) {
      setPill((p) => ({ ...p, ready: false }))
      return
    }
    const navBox = nav.getBoundingClientRect()
    const itemBox = el.getBoundingClientRect()
    setPill({
      top: itemBox.top - navBox.top,
      height: itemBox.height,
      ready: true,
    })
  }

  useLayoutEffect(() => {
    updatePill()
  }, [activeItem, pathname, collapsed, items, rail, openId])

  useEffect(() => {
    if (rail || reducedMotion) return
    const t = window.setTimeout(updatePill, 320)
    return () => window.clearTimeout(t)
  }, [openId, rail, reducedMotion])

  useEffect(() => {
    const list = listRef.current
    if (!list) return
    list.addEventListener('scroll', updatePill, { passive: true })
    window.addEventListener('resize', updatePill)
    return () => {
      list.removeEventListener('scroll', updatePill)
      window.removeEventListener('resize', updatePill)
    }
  }, [activeItem, rail, openId])

  const footerClass = (isCollapsed: boolean) =>
    cn(
      'group flex min-h-11 w-full cursor-pointer items-center gap-3.5 text-left text-[0.9375rem] font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2',
      rail
        ? cn(
            'justify-center rounded-2xl px-0 py-2.5 text-white/70 hover:bg-white/10 hover:text-white focus-visible:ring-white/80',
            isCollapsed && 'mx-auto h-11 w-11',
          )
        : cn(
            'text-ink-400 hover:bg-primary-50/60 hover:text-ink-600 focus-visible:ring-primary',
            isCollapsed ? 'justify-center px-0 py-2.5' : 'rounded-r-2xl py-2.5 pl-5 pr-4',
          ),
    )

  return (
    <aside
      className={cn(
        'sticky top-0 z-20 hidden h-screen shrink-0 flex-col self-stretch overflow-visible ease-out lg:flex',
        reducedMotion
          ? 'transition-[width,background-color,margin] duration-150'
          : 'transition-[width,background-color,margin,transform,opacity] duration-300',
        rail
          ? 'w-[4.5rem] border-r-0 bg-primary'
          : 'w-[15.25rem] border-r border-primary-100/60 bg-white',
        chromeHidden &&
          (rail
            ? 'pointer-events-none -ml-[4.5rem] w-0 -translate-x-2 opacity-0'
            : 'pointer-events-none -ml-[15.25rem] w-0 -translate-x-2 opacity-0'),
      )}
      aria-label="Workspace sidebar"
      aria-hidden={chromeHidden}
    >
      <div
        className={cn(
          'flex h-[4.5rem] shrink-0 items-center transition-opacity duration-300',
          rail ? 'justify-center px-1.5' : 'px-5',
          brandMuted && 'opacity-40',
        )}
        aria-hidden={rail}
      >
        {!rail && <BrandLogo to="/workspace" size="sm" />}
      </div>

      <nav ref={navRef} className="relative z-10 min-h-0 flex-1 overflow-visible">
        {!rail && (
          <div
            aria-hidden
            className={cn(
              'pointer-events-none absolute left-0 z-0 rounded-r-2xl bg-primary-50',
              reducedMotion
                ? ''
                : 'transition-[transform,height,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
              pill.ready ? 'opacity-100' : 'opacity-0',
            )}
            style={{
              top: 0,
              height: pill.height,
              width: `calc(100% + ${ACTIVE_OVERLAP_PX}px)`,
              transform: `translateY(${pill.top}px)`,
            }}
          >
            <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-primary" />
          </div>
        )}

        <div
          ref={listRef}
          className={cn(
            'relative z-[1] h-full space-y-1 overflow-y-auto overflow-x-hidden py-2 [scrollbar-width:thin]',
            rail && 'px-2',
          )}
        >
          {items.map((entry) => {
            if (entry.type === 'link') {
              return (
                <NavItemLink
                  key={entry.item.to}
                  item={entry.item}
                  active={pathMatches(pathname, entry.item.to, entry.item.end)}
                  collapsed={collapsed}
                  rail={rail}
                  itemRef={(el) => {
                    if (el) itemRefs.current.set(entry.item.to, el)
                    else itemRefs.current.delete(entry.item.to)
                  }}
                />
              )
            }

            return (
              <NavGroupBlock
                key={entry.group.id}
                group={entry.group}
                pathname={pathname}
                collapsed={collapsed}
                rail={rail}
                open={openId === entry.group.id}
                reducedMotion={reducedMotion}
                onToggle={() =>
                  setOpenId((current) => (current === entry.group.id ? null : entry.group.id))
                }
                flyoutOpen={flyoutId === entry.group.id}
                onFlyoutToggle={() =>
                  setFlyoutId((id) => (id === entry.group.id ? null : entry.group.id))
                }
                itemRef={(to, el) => {
                  if (el) itemRefs.current.set(to, el)
                  else itemRefs.current.delete(to)
                }}
              />
            )
          })}
        </div>
      </nav>

      <div
        className={cn(
          'mt-auto shrink-0 space-y-1 py-3',
          rail ? 'border-t border-white/15 px-2' : 'border-t border-primary-100/60',
        )}
      >
        <Link
          to="/workspace/admin"
          title={collapsed ? 'Help' : undefined}
          className={footerClass(collapsed)}
        >
          <CircleHelp className="h-5 w-5 shrink-0" strokeWidth={ICON_STROKE} aria-hidden />
          {!collapsed && <span>Help</span>}
        </Link>
        <button
          type="button"
          title={collapsed ? 'Log out' : undefined}
          onClick={() => navigate('/')}
          className={footerClass(collapsed)}
        >
          <LogOut className="h-5 w-5 shrink-0" strokeWidth={ICON_STROKE} aria-hidden />
          {!collapsed && <span>Log Out</span>}
        </button>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={footerClass(collapsed)}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-5 w-5" strokeWidth={ICON_STROKE} aria-hidden />
          ) : (
            <>
              <PanelLeftClose className="h-5 w-5 shrink-0" strokeWidth={ICON_STROKE} aria-hidden />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  )
}
