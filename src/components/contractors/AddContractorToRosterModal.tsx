import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { HardHat, Search, UserPlus } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Agency, AppUser } from '../../types/domain'
import {
  CONTRACTOR_TRADES,
  listContractorsAvailableForRoster,
  tradeLabel,
} from '../../lib/contractors'
import { withReturnTo } from '../../lib/returnTo'
import { Badge, Button, Input, Modal, Select, Textarea, cn } from '../ui'

const ICON_STROKE = 1.6

export function AddContractorToRosterModal({
  open,
  onClose,
  agencyId,
  agencies,
  roster,
  users,
  canCreateUser,
  returnTo,
  onSubmit,
}: {
  open: boolean
  onClose: () => void
  agencyId: string | null
  agencies: Agency[]
  roster: Parameters<typeof listContractorsAvailableForRoster>[0]
  users: AppUser[]
  canCreateUser: boolean
  returnTo: string
  onSubmit: (input: {
    contractorUserId: string
    trades: string[]
    notes: string
  }) => void
}) {
  const [pickUserId, setPickUserId] = useState('')
  const [pickTrades, setPickTrades] = useState<string[]>(['GENERAL'])
  const [notes, setNotes] = useState('')
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)

  const available = useMemo(
    () => listContractorsAvailableForRoster(roster, users, agencyId),
    [roster, users, agencyId],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return available
    return available.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.company?.toLowerCase().includes(q) ?? false),
    )
  }, [available, query])

  const selected = available.find((u) => u.id === pickUserId)

  const agencyName = (id: string | null | undefined) =>
    agencies.find((a) => a.id === id)?.name ?? 'Other agency'

  useEffect(() => {
    if (!open) return
    setPickUserId('')
    setPickTrades(['GENERAL'])
    setNotes('')
    setQuery('')
    setError(null)
  }, [open])

  useEffect(() => {
    if (pickUserId && !available.some((u) => u.id === pickUserId)) {
      setPickUserId('')
    }
  }, [available, pickUserId])

  const toggleTrade = (key: string) => {
    setPickTrades((prev) => {
      if (prev.includes(key)) {
        const next = prev.filter((t) => t !== key)
        return next.length ? next : prev
      }
      return [...prev, key]
    })
  }

  const createUserHref = agencyId
    ? withReturnTo(
        `/workspace/admin/users/new?agencyId=${encodeURIComponent(agencyId)}&intent=contractor`,
        returnTo,
      )
    : '/workspace/admin/users/new'

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!pickUserId) {
      setError('Choose a contractor account to add to your roster.')
      return
    }
    if (!pickTrades.length) {
      setError('Select at least one trade.')
      return
    }
    setError(null)
    onSubmit({ contractorUserId: pickUserId, trades: pickTrades, notes: notes.trim() })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add contractor to roster"
      description="Approved vendors appear when agents book maintenance. You can add contractors from any agency."
      size="lg"
      footer={
        <>
          <Button variant="secondary" className="min-h-11 cursor-pointer" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="min-h-11 cursor-pointer"
            form="add-contractor-roster-form"
            type="submit"
            disabled={!pickUserId || !available.length}
          >
            Add to roster
          </Button>
        </>
      }
    >
      <form id="add-contractor-roster-form" className="space-y-5" onSubmit={handleSubmit}>
        {error ? (
          <p className="rounded-xl border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}

        {available.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-primary-200 bg-primary-50/40 px-4 py-6 text-center">
            <span className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-100 text-primary">
              <HardHat className="h-5 w-5" strokeWidth={ICON_STROKE} aria-hidden />
            </span>
            <p className="mt-3 font-medium text-ink">No contractor accounts available</p>
            <p className="mt-1 text-sm text-ink-500">
              Every contractor user is already on your roster, or none exist yet. Create a contractor
              account first, then add them here.
            </p>
            {canCreateUser ? (
              <Link to={createUserHref} className="mt-4 inline-block" onClick={onClose}>
                <Button type="button" className="min-h-11 cursor-pointer">
                  <UserPlus className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                  Create contractor account
                </Button>
              </Link>
            ) : (
              <p className="mt-3 text-xs text-ink-500">
                Ask an admin to create contractor accounts under People → Users.
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <label htmlFor="contractor-pick" className="block text-sm font-medium text-ink">
                Contractor
              </label>
              {available.length > 5 ? (
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
                    strokeWidth={ICON_STROKE}
                    aria-hidden
                  />
                  <Input
                    id="contractor-search"
                    className="min-h-11 pl-9"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search by name, company, or email…"
                    aria-label="Search contractors"
                  />
                </div>
              ) : null}
              <Select
                id="contractor-pick"
                className="min-h-11 w-full"
                value={pickUserId}
                onChange={(e) => {
                  setPickUserId(e.target.value)
                  setError(null)
                }}
                required
              >
                <option value="">Choose a contractor…</option>
                {filtered.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                    {u.company ? ` · ${u.company}` : ''} · {u.email}
                    {u.agencyId && u.agencyId !== agencyId
                      ? ` · ${agencyName(u.agencyId)}`
                      : ''}
                  </option>
                ))}
              </Select>
              {filtered.length === 0 && query ? (
                <p className="text-xs text-ink-500">No matches for “{query.trim()}”.</p>
              ) : null}
              {!pickUserId && canCreateUser ? (
                <p className="text-xs text-ink-500">
                  Not listed?{' '}
                  <Link
                    to={createUserHref}
                    className="font-medium text-primary underline-offset-2 hover:underline"
                    onClick={onClose}
                  >
                    Create a contractor account
                  </Link>
                </p>
              ) : null}
            </div>

            {selected ? (
              <div className="flex items-start gap-3 rounded-2xl border border-primary-100 bg-primary-50/50 p-4">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-primary shadow-sm">
                  <HardHat className="h-5 w-5" strokeWidth={ICON_STROKE} aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{selected.name}</p>
                  {selected.company ? (
                    <p className="text-sm text-ink-500">{selected.company}</p>
                  ) : null}
                  <p className="mt-1 text-sm text-ink-600">{selected.email}</p>
                  {selected.agencyId && selected.agencyId !== agencyId ? (
                    <Badge tone="neutral" className="mt-2">
                      {agencyName(selected.agencyId)}
                    </Badge>
                  ) : null}
                </div>
              </div>
            ) : null}

            <fieldset>
              <legend className="text-sm font-medium text-ink">Trades</legend>
              <p className="mt-0.5 text-xs text-ink-500">
                Pick every service this vendor handles — used when matching maintenance categories.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {CONTRACTOR_TRADES.map((t) => {
                  const active = pickTrades.includes(t.key)
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => toggleTrade(t.key)}
                      aria-pressed={active}
                      className={cn(
                        'min-h-11 cursor-pointer rounded-full border px-3.5 text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                        active
                          ? 'border-primary bg-primary text-white'
                          : 'border-primary-100 bg-white text-ink-600 hover:border-primary-200 hover:bg-primary-50',
                      )}
                    >
                      {t.label}
                    </button>
                  )
                })}
              </div>
              {pickTrades.length ? (
                <p className="mt-2 text-xs text-ink-500">
                  Selected: {pickTrades.map(tradeLabel).join(', ')}
                </p>
              ) : null}
            </fieldset>

            <label htmlFor="contractor-notes" className="block text-sm font-medium text-ink">
              Notes
              <Textarea
                id="contractor-notes"
                className="mt-1.5 min-h-24"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="COID expiry, service areas, after-hours contact…"
              />
            </label>
          </>
        )}
      </form>
    </Modal>
  )
}
