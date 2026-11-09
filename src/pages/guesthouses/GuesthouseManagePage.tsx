/**
 * Workspace: one guest house — occupancy calendar, bookings, rooms & rates,
 * blocked dates and listing settings (/workspace/guesthouses/:id, /new).
 */
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ExternalLink, Plus, Trash2 } from 'lucide-react'
import { Badge, Button, Card, EmptyState, Input, Modal, PageHeader, Select, Textarea } from '../../components/ui'
import {
  AMENITY_LABELS,
  POLICY_LABELS,
  addBlockApi,
  addDays,
  createGuesthouseApi,
  deleteGuesthouseApi,
  deleteRoomApi,
  fmtDay,
  getGuesthouseApi,
  isoDay,
  removeBlockApi,
  saveRoomApi,
  updateGuesthouseApi,
  zar,
  type CancellationPolicy,
  type GuesthouseInput,
  type GuesthouseStatus,
  type ManagedGuesthouse,
  type Room,
  type RoomInput,
} from '../../lib/api/guesthousesApi'
import { GuestBookingsTable } from './GuestBookingsTable'

const TABS = ['calendar', 'bookings', 'rooms', 'blocks', 'settings'] as const
type Tab = (typeof TABS)[number]
const TAB_LABEL: Record<Tab, string> = { calendar: 'Calendar', bookings: 'Bookings', rooms: 'Rooms & rates', blocks: 'Blocked dates', settings: 'Listing settings' }

const EMPTY: GuesthouseInput = {
  name: '', description: '', address: '', suburb: '', city: '', photos: [], amenities: [], houseRules: '',
  checkInTime: '14:00', checkOutTime: '10:00', cancellationPolicy: 'moderate', instantBook: false, tourismLevyPct: 1,
  contactPhone: '', contactEmail: '', status: 'draft',
}

function SettingsForm({ initial, onSaved, isNew }: { initial: GuesthouseInput; onSaved: (id: string) => void; isNew: boolean }) {
  const [f, setF] = useState<GuesthouseInput>(initial)
  const [photosText, setPhotosText] = useState((initial.photos ?? []).join('\n'))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const set = (patch: GuesthouseInput) => { setF((x) => ({ ...x, ...patch })); setSaved(false) }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const body = { ...f, photos: photosText.split(/\s+/).map((s) => s.trim()).filter(Boolean) }
    try {
      const out = isNew ? await createGuesthouseApi(body) : await updateGuesthouseApi(String((initial as { id?: string }).id), body)
      setSaved(true)
      onSaved(out.id)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const lbl = 'block text-sm font-medium text-ink'
  return (
    <form onSubmit={submit} className="space-y-5">
      <Card className="space-y-4 p-5">
        <h3 className="font-semibold text-ink">About the place</h3>
        <label className={lbl}>Name<Input className="mt-1" required value={f.name ?? ''} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Seaview Guest House" /></label>
        <label className={lbl}>Description<Textarea className="mt-1" rows={5} value={f.description ?? ''} onChange={(e) => set({ description: e.target.value })} placeholder="What makes the stay special, what's nearby, parking, breakfast…" /></label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className={`${lbl} sm:col-span-3`}>Street address<Input className="mt-1" value={f.address ?? ''} onChange={(e) => set({ address: e.target.value })} /></label>
          <label className={lbl}>Suburb<Input className="mt-1" value={f.suburb ?? ''} onChange={(e) => set({ suburb: e.target.value })} /></label>
          <label className={lbl}>City / town<Input className="mt-1" required value={f.city ?? ''} onChange={(e) => set({ city: e.target.value })} /></label>
        </div>
        <label className={lbl}>Photo links (one per line, first is the cover)
          <Textarea className="mt-1 font-mono text-xs" rows={3} value={photosText} onChange={(e) => { setPhotosText(e.target.value); setSaved(false) }} placeholder="https://…/front.jpg" />
        </label>
      </Card>

      <Card className="space-y-3 p-5">
        <h3 className="font-semibold text-ink">Amenities</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Object.entries(AMENITY_LABELS).map(([k, label]) => (
            <label key={k} className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={f.amenities?.includes(k) ?? false}
                onChange={(e) => set({ amenities: e.target.checked ? [...(f.amenities ?? []), k] : (f.amenities ?? []).filter((a) => a !== k) })}
              />
              {label}
            </label>
          ))}
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <h3 className="font-semibold text-ink">Booking rules</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className={lbl}>Check-in from<Input className="mt-1" type="time" value={f.checkInTime ?? '14:00'} onChange={(e) => set({ checkInTime: e.target.value })} /></label>
          <label className={lbl}>Check-out by<Input className="mt-1" type="time" value={f.checkOutTime ?? '10:00'} onChange={(e) => set({ checkOutTime: e.target.value })} /></label>
          <label className={lbl}>Tourism levy %<Input className="mt-1" type="number" min={0} max={15} step="0.1" value={f.tourismLevyPct ?? 1} onChange={(e) => set({ tourismLevyPct: Number(e.target.value) })} /></label>
        </div>
        <label className={lbl}>Cancellation policy
          <Select className="mt-1" value={f.cancellationPolicy} onChange={(e) => set({ cancellationPolicy: e.target.value as CancellationPolicy })}>
            {Object.entries(POLICY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </label>
        <label className="flex items-start gap-2 text-sm text-ink">
          <input type="checkbox" className="mt-1" checked={f.instantBook ?? false} onChange={(e) => set({ instantBook: e.target.checked })} />
          <span><span className="font-medium">Instant book</span><br /><span className="text-ink-400">Guests are confirmed straight away. Off: each booking is a request you accept within 24 hours.</span></span>
        </label>
        <label className={lbl}>House rules<Textarea className="mt-1" rows={3} value={f.houseRules ?? ''} onChange={(e) => set({ houseRules: e.target.value })} placeholder="No smoking indoors. Quiet after 22:00. No parties." /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={lbl}>Host phone (for confirmed guests)<Input className="mt-1" value={f.contactPhone ?? ''} onChange={(e) => set({ contactPhone: e.target.value })} /></label>
          <label className={lbl}>Host email<Input className="mt-1" type="email" value={f.contactEmail ?? ''} onChange={(e) => set({ contactEmail: e.target.value })} /></label>
        </div>
      </Card>

      <Card className="flex flex-wrap items-end justify-between gap-3 p-5">
        <label className={lbl}>Visibility
          <Select className="mt-1 w-56" value={f.status} onChange={(e) => set({ status: e.target.value as GuesthouseStatus })} disabled={isNew}>
            <option value="draft">Draft — hidden</option>
            <option value="published">Published — guests can book</option>
            <option value="paused">Paused — no new bookings</option>
          </Select>
          {isNew && <span className="mt-1 block text-xs text-ink-400">Save, add rooms, then publish.</span>}
        </label>
        <div className="flex items-center gap-3">
          {saved && <span className="text-sm text-emerald-600">Saved</span>}
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : isNew ? 'Create guest house' : 'Save changes'}</Button>
        </div>
      </Card>
      {error && <p className="rounded-lg bg-accent-50 px-3 py-2 text-sm text-accent-700">{error}</p>}
    </form>
  )
}

function RoomModal({ houseId, room, open, onClose, onSaved }: { houseId: string; room: Room | null; open: boolean; onClose: () => void; onSaved: () => void }) {
  const init: RoomInput = room ?? { name: '', description: '', bedSetup: '1 queen bed', maxGuests: 2, nightlyRate: 0, weekendRate: null, cleaningFee: 0, minNights: 1, maxNights: 30, photos: [], active: true }
  const [f, setF] = useState<RoomInput>(init)
  const [photos, setPhotos] = useState((init.photos ?? []).join('\n'))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { setF(init); setPhotos((init.photos ?? []).join('\n')); setError(null) }, [room, open]) // eslint-disable-line react-hooks/exhaustive-deps
  const set = (p: RoomInput) => setF((x) => ({ ...x, ...p }))
  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await saveRoomApi(houseId, room?.id ?? null, { ...f, photos: photos.split(/\s+/).filter(Boolean) })
      onSaved()
      onClose()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const lbl = 'block text-sm font-medium text-ink'
  return (
    <Modal open={open} onClose={onClose} title={room ? `Edit ${room.name}` : 'Add a room'} size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => void save()} disabled={busy}>{busy ? 'Saving…' : 'Save room'}</Button></>}>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={lbl}>Room name<Input className="mt-1" value={f.name ?? ''} onChange={(e) => set({ name: e.target.value })} placeholder="Garden Suite" /></label>
          <label className={lbl}>Beds<Input className="mt-1" value={f.bedSetup ?? ''} onChange={(e) => set({ bedSetup: e.target.value })} placeholder="1 king bed + sleeper couch" /></label>
        </div>
        <label className={lbl}>Description<Textarea className="mt-1" rows={2} value={f.description ?? ''} onChange={(e) => set({ description: e.target.value })} placeholder="En-suite, private entrance, garden view" /></label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className={lbl}>Nightly rate (R)<Input className="mt-1" type="number" min={0} value={f.nightlyRate || ''} onChange={(e) => set({ nightlyRate: Number(e.target.value) })} /></label>
          <label className={lbl}>Fri/Sat rate (R)<Input className="mt-1" type="number" min={0} placeholder="Same" value={f.weekendRate ?? ''} onChange={(e) => set({ weekendRate: e.target.value ? Number(e.target.value) : null })} /></label>
          <label className={lbl}>Cleaning fee (R)<Input className="mt-1" type="number" min={0} value={f.cleaningFee ?? 0} onChange={(e) => set({ cleaningFee: Number(e.target.value) })} /></label>
          <label className={lbl}>Sleeps<Input className="mt-1" type="number" min={1} max={30} value={f.maxGuests ?? 2} onChange={(e) => set({ maxGuests: Number(e.target.value) })} /></label>
          <label className={lbl}>Min nights<Input className="mt-1" type="number" min={1} value={f.minNights ?? 1} onChange={(e) => set({ minNights: Number(e.target.value) })} /></label>
          <label className={lbl}>Max nights<Input className="mt-1" type="number" min={1} value={f.maxNights ?? 30} onChange={(e) => set({ maxNights: Number(e.target.value) })} /></label>
        </div>
        <label className={lbl}>Photo links (one per line)<Textarea className="mt-1 font-mono text-xs" rows={2} value={photos} onChange={(e) => setPhotos(e.target.value)} /></label>
        <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={f.active !== false} onChange={(e) => set({ active: e.target.checked })} />Bookable</label>
        {error && <p className="rounded-lg bg-accent-50 px-3 py-2 text-sm text-accent-700">{error}</p>}
      </div>
    </Modal>
  )
}

/** Rooms x next 21 days. Each cell shows who is in that night, or a block. */
function OccupancyGrid({ house }: { house: ManagedGuesthouse }) {
  const [start, setStart] = useState(isoDay(new Date()))
  const days = useMemo(() => Array.from({ length: 21 }, (_, i) => addDays(start, i)), [start])
  const rooms = house.rooms.filter((r) => r.active)
  const live = house.bookings.filter((b) => ['pending', 'confirmed', 'checked_in', 'completed'].includes(b.status))
  if (!rooms.length) return <EmptyState title="No rooms yet" description="Add rooms under Rooms & rates to see the calendar." />
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <Button size="sm" variant="secondary" onClick={() => setStart(addDays(start, -7))}>‹ Week</Button>
        <Button size="sm" variant="secondary" onClick={() => setStart(isoDay(new Date()))}>Today</Button>
        <Button size="sm" variant="secondary" onClick={() => setStart(addDays(start, 7))}>Week ›</Button>
        <span className="ml-2 flex items-center gap-3 text-xs text-ink-400">
          <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-primary" />Confirmed</span>
          <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-amber-400" />Request</span>
          <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-ink-300" />Blocked</span>
        </span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-primary-100 bg-white">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 min-w-32 bg-white p-2 text-left font-semibold text-ink">Room</th>
              {days.map((d) => {
                const dt = new Date(`${d}T00:00:00Z`)
                const wk = dt.getUTCDay() === 5 || dt.getUTCDay() === 6
                return (
                  <th key={d} className={`min-w-10 p-1 text-center font-normal ${wk ? 'bg-primary-50' : ''}`}>
                    <div className="text-ink-400">{dt.toLocaleDateString('en-ZA', { weekday: 'narrow', timeZone: 'UTC' })}</div>
                    <div className="font-semibold text-ink">{dt.getUTCDate()}</div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {rooms.map((r) => (
              <tr key={r.id} className="border-t border-primary-100">
                <td className="sticky left-0 z-10 bg-white p-2 font-medium text-ink">{r.name}</td>
                {days.map((d) => {
                  const b = live.find((x) => x.roomId === r.id && x.checkIn <= d && x.checkOut > d)
                  const k = !b && house.blocks.find((x) => x.roomId === r.id && x.startDate <= d && x.endDate > d)
                  const first = b && b.checkIn === d
                  return (
                    <td key={d} className="p-0.5" title={b ? `${b.guestName} · ${b.reference}` : k ? k.reason ?? 'Blocked' : 'Free'}>
                      <div className={`h-7 truncate rounded px-1 leading-7 text-white ${b ? (b.status === 'pending' ? 'bg-amber-400' : 'bg-primary') : k ? 'bg-ink-300' : ''}`}>
                        {first ? b.guestName.split(' ')[0] : ''}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function GuesthouseManagePage() {
  const { id = 'new' } = useParams()
  const isNew = id === 'new'
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab: Tab = isNew ? 'settings' : ((TABS as readonly string[]).includes(params.get('tab') ?? '') ? (params.get('tab') as Tab) : 'calendar')
  const [house, setHouse] = useState<ManagedGuesthouse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [roomModal, setRoomModal] = useState<{ open: boolean; room: Room | null }>({ open: false, room: null })
  const [block, setBlock] = useState({ roomId: '', startDate: '', endDate: '', reason: '' })
  const [blockError, setBlockError] = useState<string | null>(null)

  const load = useCallback(() => {
    if (isNew) return
    getGuesthouseApi(id).then((h) => { setHouse(h); setError(null) }).catch((e: Error) => setError(e.message))
  }, [id, isNew])
  useEffect(load, [load])

  if (error) return <EmptyState title="Could not open this guest house" description={error} />
  if (!isNew && !house) return <div className="h-60 animate-pulse rounded-2xl bg-primary-50" />

  const removeRoom = async (r: Room) => {
    if (!house || !window.confirm(`Remove ${r.name}? Rooms with past bookings are switched off instead.`)) return
    try { await deleteRoomApi(house.id, r.id); load() } catch (e) { window.alert((e as Error).message) }
  }
  const addBlock = async (e: FormEvent) => {
    e.preventDefault()
    if (!house) return
    setBlockError(null)
    try {
      await addBlockApi(house.id, { ...block, roomId: block.roomId || house.rooms[0]?.id || '' })
      setBlock({ roomId: block.roomId, startDate: '', endDate: '', reason: '' })
      load()
    } catch (err) { setBlockError((err as Error).message) }
  }
  const removeHouse = async () => {
    if (!house || !window.confirm(`Delete ${house.name}? This cannot be undone.`)) return
    try { await deleteGuesthouseApi(house.id); navigate('/workspace/guesthouses') } catch (e) { window.alert((e as Error).message) }
  }

  return (
    <div className="space-y-5">
      <Link to="/workspace/guesthouses" className="inline-flex items-center gap-1 text-sm text-ink-400 hover:text-ink"><ArrowLeft className="h-4 w-4" />Guest houses</Link>
      <PageHeader
        title={isNew ? 'New guest house' : house!.name}
        subtitle={isNew ? 'Set up the listing first. You add rooms and rates next.' : [house!.suburb, house!.city].filter(Boolean).join(', ')}
        actions={!isNew && house!.status === 'published' ? (
          <a href={`/stays/${house!.id}`} target="_blank" rel="noreferrer"><Button variant="secondary"><ExternalLink className="mr-1 h-4 w-4" />View public page</Button></a>
        ) : undefined}
      />
      {!isNew && house && (
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={house.status === 'published' ? 'success' : house.status === 'paused' ? 'warning' : 'neutral'}>{house.status}</Badge>
          {house.instantBook && <Badge tone="info">Instant book</Badge>}
          {house.status !== 'published' && <span className="text-sm text-ink-400">Guests can't see this yet. Add rooms, then publish under Listing settings.</span>}
        </div>
      )}
      {!isNew && (
        <div className="flex gap-1 overflow-x-auto border-b border-primary-100">
          {TABS.map((t) => (
            <button key={t} type="button" onClick={() => setParams({ tab: t })}
              className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium ${tab === t ? 'border-primary text-primary' : 'border-transparent text-ink-400 hover:text-ink'}`}>
              {TAB_LABEL[t]}{t === 'bookings' && house ? ` (${house.bookings.filter((b) => b.status === 'pending').length || house.bookings.length})` : ''}
            </button>
          ))}
        </div>
      )}

      {tab === 'calendar' && house && <OccupancyGrid house={house} />}
      {tab === 'bookings' && house && <GuestBookingsTable bookings={house.bookings} onChange={() => load()} />}
      {tab === 'rooms' && house && (
        <div className="space-y-3">
          <div className="flex justify-end"><Button onClick={() => setRoomModal({ open: true, room: null })}><Plus className="mr-1 h-4 w-4" />Add room</Button></div>
          {house.rooms.length === 0 ? (
            <EmptyState title="No rooms yet" description="Each room has its own rate, guest limit and minimum stay." />
          ) : house.rooms.map((r) => (
            <Card key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-semibold text-ink">{r.name} {!r.active && <Badge>off</Badge>}</p>
                <p className="text-sm text-ink-400">{r.bedSetup} · sleeps {r.maxGuests} · {r.minNights}–{r.maxNights} nights</p>
                <p className="text-sm text-ink">{zar(r.nightlyRate)} / night{r.weekendRate != null ? ` · Fri/Sat ${zar(r.weekendRate)}` : ''}{r.cleaningFee ? ` · cleaning ${zar(r.cleaningFee)}` : ''}</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => setRoomModal({ open: true, room: r })}>Edit</Button>
                <Button size="sm" variant="ghost" onClick={() => void removeRoom(r)} aria-label={`Remove ${r.name}`}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </Card>
          ))}
          <RoomModal houseId={house.id} room={roomModal.room} open={roomModal.open} onClose={() => setRoomModal({ open: false, room: null })} onSaved={load} />
        </div>
      )}
      {tab === 'blocks' && house && (
        <div className="space-y-4">
          <Card className="p-5">
            <p className="mb-3 text-sm text-ink-400">Close a room for maintenance, owner use or bookings taken elsewhere. Guests can't book blocked nights.</p>
            <form onSubmit={addBlock} className="grid gap-2 sm:grid-cols-5">
              <Select value={block.roomId || house.rooms[0]?.id || ''} onChange={(e) => setBlock({ ...block, roomId: e.target.value })} aria-label="Room">
                {house.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </Select>
              <Input type="date" required value={block.startDate} onChange={(e) => setBlock({ ...block, startDate: e.target.value })} aria-label="From" />
              <Input type="date" required min={block.startDate} value={block.endDate} onChange={(e) => setBlock({ ...block, endDate: e.target.value })} aria-label="Until (first free day)" />
              <Input placeholder="Reason (optional)" value={block.reason} onChange={(e) => setBlock({ ...block, reason: e.target.value })} />
              <Button type="submit" disabled={!house.rooms.length}>Block dates</Button>
            </form>
            <p className="mt-2 text-xs text-ink-400">The end date is the first night the room is open again.</p>
            {blockError && <p className="mt-2 rounded-lg bg-accent-50 px-3 py-2 text-sm text-accent-700">{blockError}</p>}
          </Card>
          {house.blocks.length === 0 ? <EmptyState title="No blocked dates" description="All rooms are open for booking." /> : (
            <div className="space-y-2">
              {house.blocks.map((k) => (
                <Card key={k.id} className="flex items-center justify-between gap-3 p-3">
                  <p className="text-sm text-ink"><span className="font-medium">{house.rooms.find((r) => r.id === k.roomId)?.name}</span> · {fmtDay(k.startDate)} → {fmtDay(k.endDate)}{k.reason ? ` · ${k.reason}` : ''}</p>
                  <Button size="sm" variant="ghost" onClick={() => void removeBlockApi(house.id, k.id).then(load)}>Remove</Button>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
      {tab === 'settings' && (
        <>
          <SettingsForm
            key={house?.id ?? 'new'}
            isNew={isNew}
            initial={house ? { ...house, id: house.id } as GuesthouseInput : EMPTY}
            onSaved={(newId) => (isNew ? navigate(`/workspace/guesthouses/${newId}?tab=rooms`) : load())}
          />
          {!isNew && <div className="flex justify-end"><Button variant="danger" onClick={() => void removeHouse()}>Delete guest house</Button></div>}
        </>
      )}
    </div>
  )
}
