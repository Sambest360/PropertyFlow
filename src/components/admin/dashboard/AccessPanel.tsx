/**
 * Access tab: what each role, and each person, can and cannot see. Rows come
 * from src/lib/accessMatrix.ts, which uses the same checks the sidebar, route
 * guards and server gates use.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Minus, Search, ShieldOff } from 'lucide-react'
import type { Role } from '../../../types/domain'
import { allRestricted, isRestrictedPermission, roleLabels } from '../../../lib/permissions'
import {
  MATRIX_ROLES,
  capabilityGroups,
  dashboardSectionRows,
  navPathsFor,
  pageRows,
  permissionReason,
  roleShortLabel,
  roleSubjects,
  type AccessSubject,
  type CellReason,
} from '../../../lib/accessMatrix'
import { fetchAccessPeople, type AccessPayload, type AccessPerson } from '../../../lib/api/adminDashboardApi'
import { Badge, cn } from '../../ui'
import { Bone } from '../../loading/PageSkeleton'
import { Panel, Segmented } from './DashboardWidgets'

type MatrixKind = 'capabilities' | 'pages' | 'dashboard'

function Cell({ allowed }: { allowed: boolean }) {
  return allowed ? (
    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
      <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden />
      <span className="sr-only">Allowed</span>
    </span>
  ) : (
    <span className="inline-flex h-5 w-5 items-center justify-center text-ink-300">
      <Minus className="h-3 w-3" aria-hidden />
      <span className="sr-only">Not allowed</span>
    </span>
  )
}

function RoleMatrix({ roles }: { roles: readonly Role[] }) {
  const [kind, setKind] = useState<MatrixKind>('capabilities')
  const subjects = useMemo(() => roleSubjects(roles), [roles])
  const groups = useMemo(() => {
    if (kind === 'capabilities') {
      return capabilityGroups().map((g) => ({
        id: g.id,
        label: g.label,
        rows: g.rows.map((r) => ({
          id: r.id,
          label: r.label,
          hint: r.hint,
          allowed: Object.fromEntries(roles.map((role) => [role, r.permissions.every((p) => permissionReason({ role }, p) === 'role')])),
        })),
      }))
    }
    if (kind === 'pages') {
      return [{ id: 'pages', label: 'Sidebar pages', rows: pageRows(subjects).map((r) => ({ id: r.path, label: r.label, hint: r.path, allowed: r.allowed })) }]
    }
    return [
      {
        id: 'dash',
        label: 'Admin dashboard sections',
        rows: dashboardSectionRows(subjects).map((r) => ({ id: r.id, label: r.label, hint: `needs ${r.anyOf.join(' or ')}`, allowed: r.allowed })),
      },
    ]
  }, [kind, roles, subjects])

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Segmented<MatrixKind>
          label="What to compare"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'capabilities', label: 'Capabilities' },
            { value: 'pages', label: 'Pages' },
            { value: 'dashboard', label: 'Dashboard' },
          ]}
        />
        <p className="text-xs text-ink-400">Role defaults. Agency modules and per-user settings can narrow these; see a person below.</p>
      </div>
      <div className="-mx-4 overflow-x-auto sm:-mx-5">
        <table className="w-full min-w-[720px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="text-xs text-ink-500">
              <th scope="col" className="sticky left-0 z-10 border-b border-primary-100 bg-white px-4 py-2 text-left font-medium sm:px-5">
                {kind === 'pages' ? 'Page' : kind === 'dashboard' ? 'Section' : 'Capability'}
              </th>
              {roles.map((r) => (
                <th key={r} scope="col" className="border-b border-primary-100 px-2 py-2 text-center font-medium" title={roleLabels[r]}>
                  {roleShortLabel(r)}
                </th>
              ))}
            </tr>
          </thead>
          {groups.map((g) => (
            <tbody key={g.id}>
              {groups.length > 1 ? (
                <tr>
                  <th colSpan={roles.length + 1} scope="colgroup" className="sticky left-0 bg-primary-50/50 px-4 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-500 sm:px-5">
                    {g.label}
                  </th>
                </tr>
              ) : null}
              {g.rows.map((row) => (
                <tr key={row.id} className="hover:bg-primary-50/40">
                  <th scope="row" className="sticky left-0 z-10 max-w-[15rem] border-b border-primary-100/60 bg-white px-4 py-2 text-left font-normal sm:px-5">
                    <span className="block truncate text-ink">{row.label}</span>
                    {row.hint ? <span className="block truncate font-mono text-[11px] text-ink-400">{row.hint}</span> : null}
                  </th>
                  {roles.map((r) => (
                    <td key={r} className="border-b border-primary-100/60 px-2 py-2 text-center">
                      <Cell allowed={!!row.allowed[r]} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </div>
  )
}

const REASON: Record<CellReason, { label: string; tone: 'success' | 'danger' | 'warning' | 'neutral' }> = {
  role: { label: 'Allowed', tone: 'success' },
  restricted: { label: 'Switched off for this person', tone: 'danger' },
  'agency-off': { label: 'Agency module off', tone: 'warning' },
  'not-in-role': { label: 'Not part of this role', tone: 'neutral' },
}

function PersonView({ person, payload, canEdit }: { person: AccessPerson; payload: AccessPayload; canEdit: boolean }) {
  const subject: AccessSubject = { role: person.role, userEnabled: person.enabledPermissions, agencyEnabled: person.agencyEnabledPermissions }
  const [showDenied, setShowDenied] = useState(true)
  const groups = capabilityGroups()
  const pages = [...navPathsFor(subject).entries()]
  const restrictedCount = groups.flatMap((g) => g.rows).filter((r) => isRestrictedPermission(person.role, r.permissions[0], person.enabledPermissions)).length
  const blockedCollections = Object.entries(payload.collections).filter(([, perms]) => allRestricted(person.role, perms, person.enabledPermissions))
  const blockedWrites = Object.entries(payload.writes).filter(([, p]) => isRestrictedPermission(person.role, p, person.enabledPermissions))
  const isSuper = person.role === 'super_admin'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-ink">{person.name}</p>
          <p className="truncate text-xs text-ink-500">
            {roleLabels[person.role]}
            {person.agencyName ? ` · ${person.agencyName}` : ''}
            {person.email ? ` · ${person.email}` : ''}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {!person.active ? <Badge tone="danger">Disabled</Badge> : null}
            {isSuper ? (
              <Badge tone="info">Full platform access</Badge>
            ) : person.enabledPermissions ? (
              <Badge tone={restrictedCount ? 'warning' : 'neutral'}>
                Custom permissions{restrictedCount ? `, ${restrictedCount} switched off` : ''}
              </Badge>
            ) : (
              <Badge>Role defaults</Badge>
            )}
            {person.agencyEnabledPermissions ? <Badge>Agency modules limited</Badge> : null}
          </div>
        </div>
        {canEdit && !isSuper ? (
          <Link
            to={`/workspace/admin/users/${encodeURIComponent(person.id)}`}
            className="inline-flex min-h-9 items-center rounded-lg border border-primary-100 px-3 text-sm font-medium text-primary hover:bg-primary-50"
          >
            Edit permissions
          </Link>
        ) : null}
      </div>

      {isSuper ? (
        <p className="rounded-lg bg-primary-50/60 px-3 py-2 text-sm text-ink-600">
          Super admins always have every permission. The server does not apply per-user restrictions to super admins, so
          there is nothing to switch off here.
        </p>
      ) : null}

      {!isSuper && (blockedCollections.length || blockedWrites.length) ? (
        <div className="rounded-lg border border-accent-100 bg-accent-50/50 px-3 py-2.5 text-sm">
          <p className="flex items-center gap-1.5 font-medium text-accent-700">
            <ShieldOff className="h-4 w-4" aria-hidden /> Blocked on the server for this person
          </p>
          {blockedCollections.length ? (
            <p className="mt-1 text-ink-600">
              Left out of their data: <span className="font-mono text-xs">{blockedCollections.map(([k]) => k).join(', ')}</span>
            </p>
          ) : null}
          {blockedWrites.length ? (
            <p className="mt-1 text-ink-600">
              Saves refused (403): <span className="font-mono text-xs">{blockedWrites.map(([k]) => k).join(', ')}</span>
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-ink">Capabilities</h3>
        <label className="inline-flex items-center gap-2 text-xs text-ink-500">
          <input type="checkbox" checked={showDenied} onChange={(e) => setShowDenied(e.target.checked)} className="h-4 w-4 accent-[var(--color-primary)]" />
          Show what they cannot do
        </label>
      </div>
      <div className="grid gap-x-6 gap-y-4 md:grid-cols-2">
        {groups.map((g) => {
          const rows = g.rows
            .map((r) => ({ ...r, reason: permissionReason(subject, r.permissions[0]) }))
            .filter((r) => showDenied || r.reason === 'role')
          if (!rows.length) return null
          return (
            <div key={g.id} className="min-w-0">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-400">{g.label}</p>
              <ul className="divide-y divide-primary-100/60">
                {rows.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                    <span className={cn('flex min-w-0 items-center gap-2', r.reason === 'role' ? 'text-ink' : 'text-ink-400')}>
                      <Cell allowed={r.reason === 'role'} />
                      <span className="truncate">{r.label}</span>
                    </span>
                    {r.reason !== 'role' && r.reason !== 'not-in-role' ? (
                      <Badge tone={REASON[r.reason].tone} className="shrink-0">
                        {REASON[r.reason].label}
                      </Badge>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>

      <div>
        <h3 className="mb-1.5 text-[13px] font-semibold text-ink">Pages in their sidebar ({pages.length})</h3>
        <div className="flex flex-wrap gap-1.5">
          {pages.map(([path, label]) => (
            <span key={path} title={path} className="rounded-md border border-primary-100 px-2 py-0.5 text-xs text-ink-600">
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function PeoplePicker({ payload, canEdit, roleFilter }: { payload: AccessPayload; canEdit: boolean; roleFilter: readonly Role[] }) {
  const [q, setQ] = useState('')
  const [role, setRole] = useState<'all' | Role>('all')
  const people = payload.people
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return people.filter(
      (p) =>
        (role === 'all' || p.role === role) &&
        (!needle || p.name.toLowerCase().includes(needle) || (p.email ?? '').toLowerCase().includes(needle) || (p.agencyName ?? '').toLowerCase().includes(needle)),
    )
  }, [people, q, role])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = people.find((p) => p.id === selectedId) ?? filtered[0] ?? null

  if (!people.length) return <p className="py-4 text-sm text-ink-400">No people in this scope yet.</p>

  return (
    <div className="grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <div className="min-w-0">
        <div className="flex gap-2">
          <label className="relative block min-w-0 flex-1">
            <span className="sr-only">Search people</span>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Name, email or agency"
              className="h-9 w-full rounded-lg border border-primary-100 bg-white pl-8 pr-2 text-base text-ink placeholder:text-ink-400 focus:border-primary sm:text-sm"
            />
          </label>
          <label>
            <span className="sr-only">Role</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'all' | Role)}
              className="h-9 rounded-lg border border-primary-100 bg-white px-2 text-base text-ink sm:text-sm"
            >
              <option value="all">All roles</option>
              {roleFilter.map((r) => (
                <option key={r} value={r}>
                  {roleShortLabel(r)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <ul className="mt-2 max-h-[22rem] overflow-y-auto rounded-lg border border-primary-100 lg:max-h-[32rem]" aria-label="People">
          {filtered.slice(0, 200).map((p) => {
            const custom = !!p.enabledPermissions && p.role !== 'super_admin'
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(p.id)}
                  aria-current={selected?.id === p.id}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 border-b border-primary-100/60 px-3 py-2 text-left last:border-0',
                    selected?.id === p.id ? 'bg-primary-50' : 'hover:bg-primary-50/50',
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-ink">{p.name}</span>
                    <span className="block truncate text-xs text-ink-400">
                      {roleShortLabel(p.role)}
                      {p.agencyName ? ` · ${p.agencyName}` : ''}
                    </span>
                  </span>
                  {custom ? <span className="shrink-0 text-[11px] text-amber-700">Custom</span> : null}
                  {!p.active ? <span className="shrink-0 text-[11px] text-accent-700">Disabled</span> : null}
                </button>
              </li>
            )
          })}
          {!filtered.length ? <li className="px-3 py-4 text-center text-sm text-ink-400">No match.</li> : null}
        </ul>
        {filtered.length > 200 ? <p className="mt-1 text-xs text-ink-400">Showing 200 of {filtered.length}. Narrow the search.</p> : null}
      </div>
      <div className="min-w-0">{selected ? <PersonView person={selected} payload={payload} canEdit={canEdit} /> : null}</div>
    </div>
  )
}

export function AccessPanel({ platform, canEdit }: { platform: boolean; canEdit: boolean }) {
  const roles = platform ? MATRIX_ROLES : MATRIX_ROLES.filter((r) => r !== 'super_admin')
  const [payload, setPayload] = useState<AccessPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    fetchAccessPeople()
      .then((p) => live && setPayload(p))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      live = false
    }
  }, [])

  return (
    <div className="space-y-5">
      <Panel title="By role" meta="What each role is given by default, from the same checks the app and server enforce.">
        <RoleMatrix roles={roles} />
      </Panel>
      <Panel
        title="By person"
        meta={platform ? 'Everyone on the platform. Pick a person to see exactly what they can and cannot do.' : 'People in your agency. Pick a person to see exactly what they can and cannot do.'}
      >
        {error ? (
          <p className="text-sm text-accent-700">Could not load people: {error}</p>
        ) : !payload ? (
          <div className="grid gap-5 lg:grid-cols-[18rem_1fr]">
            <Bone className="h-72" />
            <Bone className="h-72" />
          </div>
        ) : (
          <PeoplePicker payload={payload} canEdit={canEdit} roleFilter={roles} />
        )}
      </Panel>
    </div>
  )
}

