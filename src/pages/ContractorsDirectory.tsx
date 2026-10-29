import { useMemo, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { HardHat, Mail, Phone, Plus, Star, Wrench } from 'lucide-react'
import { useStore } from '../context/AppStore'
import { useAuth, usePropertyScope } from '../context/AuthContext'
import { RequirePermission } from '../components/RequirePermission'
import { DirectoryStatCard } from '../components/directory/DirectoryStats'
import { CONTRACTOR_TRADES, listAgencyContractorRoster, tradeLabel } from '../lib/contractors'
import { AddContractorToRosterModal } from '../components/contractors/AddContractorToRosterModal'
import { BookContractorModal, BookingsPanel } from '../components/contractors/BookingsPanel'
import { Input } from '../components/ui'
import { currentReturnPath } from '../lib/returnTo'
import { useSuiteAlert } from '../components/alerts/SuiteAlert'
import { Badge, Button, Card, PageHeader, Select } from '../components/ui'

const ICON_STROKE = 1.6

export default function ContractorsDirectory() {
  const { state, addAgencyContractor, updateAgencyContractor } = useStore()
  const { user, has, agencyId, role } = useAuth()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as 'find' | 'roster' | 'bookings' | null) ?? 'roster'
  const setTab = (t: 'find' | 'roster' | 'bookings') => setParams((p) => { p.set('tab', t); return p }, { replace: true })
  const canBook = ['super_admin', 'client_admin', 'agent_admin', 'ground_agent'].includes(role)
  const [bookFor, setBookFor] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [area, setArea] = useState('')
  const { ticketVisible } = usePropertyScope()
  const location = useLocation()
  const alert = useSuiteAlert()
  const [trade, setTrade] = useState('all')
  const [jobsOnly, setJobsOnly] = useState(false)
  const [addOpen, setAddOpen] = useState(false)

  const roster = useMemo(() => {
    const base = listAgencyContractorRoster(state.agencyContractors, state.users, agencyId, {
      includePending: true,
      trade: trade === 'all' ? undefined : trade,
    })
    if (!jobsOnly) return base
    const withOpenJobs = new Set(
      state.tickets
        .filter(
          (t) =>
            ticketVisible(t) &&
            t.contractorId &&
            t.status !== 'Completed' &&
            t.status !== 'Cancelled',
        )
        .map((t) => t.contractorId as string),
    )
    return base.filter(({ user: contractor }) => withOpenJobs.has(contractor.id))
  }, [state.agencyContractors, state.users, state.tickets, agencyId, trade, jobsOnly, ticketVisible])

  const counts = useMemo(() => {
    const all = listAgencyContractorRoster(state.agencyContractors, state.users, agencyId, {
      includePending: true,
    })
    return {
      approved: all.filter((p) => p.roster.status === 'approved').length,
      pending: all.filter((p) => p.roster.status === 'pending').length,
      openJobs: state.tickets.filter(
        (t) =>
          ticketVisible(t) &&
          t.contractorId &&
          t.status !== 'Completed' &&
          t.status !== 'Cancelled',
      ).length,
    }
  }, [state.agencyContractors, state.users, state.tickets, agencyId, ticketVisible])

  const rosterIds = useMemo(
    () => new Set(state.agencyContractors.filter((r) => r.agencyId === agencyId).map((r) => r.contractorUserId)),
    [state.agencyContractors, agencyId],
  )
  /** Lifecycle step 1: every active contractor on Lekaya, searchable by name, trade and area. */
  const marketplace = useMemo(() => {
    const q = search.trim().toLowerCase()
    const a = area.trim().toLowerCase()
    return state.users
      .filter((u) => u.role === 'contractor' && u.active !== false)
      .map((u) => {
        const profile = (u.verification?.profile ?? {}) as Record<string, unknown>
        const areas = Array.isArray(profile.serviceAreas) ? (profile.serviceAreas as string[]) : []
        const rosterRow = state.agencyContractors.find((r) => r.contractorUserId === u.id && r.agencyId === agencyId)
        const trades = rosterRow?.trades ?? (Array.isArray(profile.trades) ? (profile.trades as string[]) : [])
        const rating = state.agencyContractors.filter((r) => r.contractorUserId === u.id && r.rating != null).map((r) => r.rating as number)
        return {
          user: u,
          areas,
          trades,
          verified: !u.verification || u.verification.status === 'approved' || u.verification.status === 'not_required',
          rating: rating.length ? rating.reduce((x, y) => x + y, 0) / rating.length : null,
          onRoster: rosterIds.has(u.id),
        }
      })
      .filter((c) => !q || c.user.name.toLowerCase().includes(q) || (c.user.company ?? '').toLowerCase().includes(q))
      .filter((c) => trade === 'all' || c.trades.some((t) => t.toLowerCase() === trade.toLowerCase()) || c.trades.includes('GENERAL'))
      .filter((c) => !a || c.areas.some((x) => x.toLowerCase().includes(a)))
      .sort((x, y) => Number(y.verified) - Number(x.verified) || (y.rating ?? 0) - (x.rating ?? 0) || x.user.name.localeCompare(y.user.name))
  }, [state.users, state.agencyContractors, agencyId, rosterIds, search, area, trade])

  const canManage = has('contractors.manage')
  const canCreateUser = has('users.manage') || has('roles.assign')
  const returnTo = currentReturnPath(location.pathname, location.search)

  const submitAdd = (input: { contractorUserId: string; trades: string[]; notes: string }) => {
    if (!agencyId) return
    const contractor = state.users.find((u) => u.id === input.contractorUserId)
    addAgencyContractor({
      agencyId,
      contractorUserId: input.contractorUserId,
      status: canManage ? 'approved' : 'pending',
      trades: input.trades.length ? input.trades : ['GENERAL'],
      notes: input.notes || undefined,
      addedAt: new Date().toISOString().slice(0, 10),
      addedByUserId: user.id,
    })
    setAddOpen(false)
    void alert.success({
      title: 'Contractor added',
      text: contractor
        ? `${contractor.name} is on your maintenance roster.`
        : 'The contractor was added to your roster.',
    })
  }

  return (
    <RequirePermission permission="contractors.view">
      <div className="animate-fade-in space-y-5">
        <PageHeader
          title="Contractors"
          subtitle="Find contractors, book them for a date, and assign them to faults and maintenance jobs."
          actions={
            canManage ? (
              <Button className="min-h-11" onClick={() => setAddOpen(true)}>
                <Plus className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                Add contractor
              </Button>
            ) : null
          }
        />

        <section className="grid gap-3 sm:grid-cols-3">
          <DirectoryStatCard
            label="Approved"
            value={counts.approved}
            hint="On maintenance roster"
            active={trade === 'all'}
            onClick={() => setTrade('all')}
          />
          <DirectoryStatCard
            label="Pending"
            value={counts.pending}
            hint="Awaiting approval"
            active={false}
            onClick={() => setTrade('all')}
            highlight={counts.pending > 0}
          />
          <DirectoryStatCard
            label="Active jobs"
            value={counts.openJobs}
            hint="Assigned & open"
            active={jobsOnly}
            onClick={() => setJobsOnly((v) => !v)}
          />
        </section>

        <div className="flex flex-wrap gap-2 border-b border-primary-100">
          {(
            [
              ['find', 'Find contractors'],
              ['roster', 'Your roster'],
              ['bookings', 'Bookings'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === id ? 'border-primary text-primary' : 'border-transparent text-ink-500 hover:text-ink'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-sm text-ink-500">
          1. Find a contractor → 2. Book them for a date → 3. Assign the booking to a fault or maintenance job.
        </p>

        {tab === 'bookings' ? <BookingsPanel mode="agency" /> : null}

        {tab === 'find' ? (
          <>
            <Card className="grid gap-3 p-4 sm:grid-cols-3">
              <Input placeholder="Search name or company" value={search} onChange={(e) => setSearch(e.target.value)} />
              <Input placeholder="Area, e.g. Walmer" value={area} onChange={(e) => setArea(e.target.value)} />
              <Select value={trade} onChange={(e) => setTrade(e.target.value)} aria-label="Trade">
                <option value="all">All trades</option>
                {CONTRACTOR_TRADES.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Card>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {marketplace.map((c) => (
                <Card key={c.user.id} className="flex flex-col gap-2 p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-ink">{c.user.name}</h3>
                    {c.verified ? <Badge tone="success">Verified</Badge> : <Badge tone="warning">Being checked</Badge>}
                    {c.onRoster ? <Badge tone="info">On your roster</Badge> : null}
                  </div>
                  {c.user.company ? <p className="text-sm text-ink-500">{c.user.company}</p> : null}
                  <p className="text-xs text-ink-500">
                    {c.trades.length ? c.trades.map(tradeLabel).join(', ') : 'General'}
                    {c.areas.length ? ` · ${c.areas.join(', ')}` : ''}
                  </p>
                  {c.rating != null ? (
                    <p className="inline-flex items-center gap-1 text-sm">
                      <Star className="h-4 w-4 text-accent" aria-hidden /> {c.rating.toFixed(1)}
                    </p>
                  ) : null}
                  <div className="mt-auto flex flex-wrap gap-2 pt-2">
                    {canBook && c.verified ? (
                      <Button size="sm" onClick={() => setBookFor(c.user.id)}>
                        Book
                      </Button>
                    ) : null}
                    {canManage && !c.onRoster && agencyId ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          submitAdd({ contractorUserId: c.user.id, trades: c.trades.length ? c.trades : ['GENERAL'], notes: '' })
                        }
                      >
                        Add to roster
                      </Button>
                    ) : null}
                    <Link to={`/profile/${encodeURIComponent(c.user.id)}`}>
                      <Button size="sm" variant="ghost">
                        Profile & reviews
                      </Button>
                    </Link>
                  </div>
                </Card>
              ))}
            </div>
            {marketplace.length === 0 ? <Card className="p-8 text-center text-sm text-ink-500">No contractors match. Try another trade or area.</Card> : null}
          </>
        ) : null}

        {tab === 'roster' ? (
        <>
        <Card className="p-4">
          <label className="block text-xs font-medium text-ink-500">
            Filter by trade
            <Select className="mt-1 min-h-11 max-w-xs" value={trade} onChange={(e) => setTrade(e.target.value)}>
              <option value="all">All trades</option>
              {CONTRACTOR_TRADES.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </Select>
          </label>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {roster.map(({ user: contractor, roster: row }) => {
            const activeJobs = state.tickets.filter(
              (t) => t.contractorId === contractor.id && t.status !== 'Completed' && t.status !== 'Cancelled',
            ).length
            return (
              <Card key={row.id} className="flex flex-col p-5">
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-100 text-primary">
                    <HardHat className="h-5 w-5" strokeWidth={ICON_STROKE} aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-ink">{contractor.name}</h3>
                      <Badge tone={row.status === 'approved' ? 'success' : row.status === 'pending' ? 'warning' : 'neutral'}>
                        {row.status}
                      </Badge>
                    </div>
                    {contractor.company ? (
                      <p className="mt-0.5 text-sm text-ink-500">{contractor.company}</p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {row.trades.map((t) => (
                        <span key={t} className="rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-medium text-primary">
                          {tradeLabel(t)}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <dl className="mt-4 space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-ink-600">
                    <Mail className="h-3.5 w-3.5 text-ink-400" strokeWidth={ICON_STROKE} aria-hidden />
                    {contractor.email}
                  </div>
                  {contractor.phone ? (
                    <div className="flex items-center gap-2 text-ink-600">
                      <Phone className="h-3.5 w-3.5 text-ink-400" strokeWidth={ICON_STROKE} aria-hidden />
                      {contractor.phone}
                    </div>
                  ) : null}
                  <div className="flex items-center gap-2 text-ink-600">
                    <Wrench className="h-3.5 w-3.5 text-ink-400" strokeWidth={ICON_STROKE} aria-hidden />
                    {activeJobs} active job{activeJobs === 1 ? '' : 's'}
                    {row.jobsCompleted != null ? ` · ${row.jobsCompleted} completed` : ''}
                  </div>
                  {row.rating != null ? (
                    <div className="flex items-center gap-1 text-ink-600">
                      <Star className="h-3.5 w-3.5 text-accent" strokeWidth={ICON_STROKE} aria-hidden />
                      <span className="tabular font-medium">{row.rating.toFixed(1)}</span>
                    </div>
                  ) : null}
                </dl>

                {row.notes ? <p className="mt-3 text-xs text-ink-500">{row.notes}</p> : null}

                <div className="mt-4 flex flex-wrap gap-2 border-t border-primary-50 pt-4">
                  {canBook && row.status === 'approved' ? (
                    <Button size="sm" className="min-h-10" onClick={() => setBookFor(contractor.id)}>
                      Book
                    </Button>
                  ) : null}
                  <Link to={`/workspace/operations/maintenance?contractor=${contractor.id}`}>
                    <Button variant="secondary" size="sm" className="min-h-10">
                      View jobs
                    </Button>
                  </Link>
                  {canManage && row.status === 'pending' ? (
                    <Button
                      size="sm"
                      className="min-h-10"
                      onClick={() => updateAgencyContractor(row.id, { status: 'approved' })}
                    >
                      Approve
                    </Button>
                  ) : null}
                  {canManage && row.status === 'approved' ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="min-h-10"
                      onClick={() => updateAgencyContractor(row.id, { status: 'suspended' })}
                    >
                      Suspend
                    </Button>
                  ) : null}
                </div>
              </Card>
            )
          })}
        </div>

        {roster.length === 0 && (
          <Card className="p-8 text-center text-sm text-ink-500">
            {jobsOnly
              ? 'No contractors with open jobs right now. Click “Active jobs” again to see the full roster.'
              : 'No contractors on the roster yet. Add approved vendors so agents and landlords can assign them to faults.'}
          </Card>
        )}

        </>
        ) : null}

        {bookFor ? (
          <BookContractorModal
            open
            contractorId={bookFor}
            onClose={() => setBookFor(null)}
            onBooked={() => setTab('bookings')}
          />
        ) : null}

        <AddContractorToRosterModal
          open={addOpen}
          onClose={() => setAddOpen(false)}
          agencyId={agencyId}
          agencies={state.agencies}
          roster={state.agencyContractors}
          users={state.users}
          canCreateUser={canCreateUser}
          returnTo={returnTo}
          onSubmit={submitAdd}
        />
      </div>
    </RequirePermission>
  )
}
