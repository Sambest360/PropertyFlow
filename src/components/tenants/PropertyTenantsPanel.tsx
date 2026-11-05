/**
 * Property → Tenants tab. Lists who lives here and lets staff add an existing
 * tenant directly (onboarding landlords who already have tenants: no
 * application), or remove one. Both ask for care and an optional note.
 */
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, UserPlus, Users } from 'lucide-react'
import type { PropertyAsset, Tenancy } from '../../types/domain'
import { useStore } from '../../context/AppStore'
import { useAuth } from '../../context/AuthContext'
import { formatZAR } from '../../data/seed'
import { Badge, Button, Card, Input, Modal, Textarea } from '../ui'
import { sweetSuccess } from '../../lib/sweetAlert'
import { RemoveTenantDialog } from './RemoveTenantDialog'

export function PropertyTenantsPanel({ property, canManage }: { property: PropertyAsset; canManage: boolean }) {
  const { state } = useStore()
  const tenancies = useMemo(
    () =>
      state.tenancies
        .filter((t) => t.propertyId === property.id)
        .sort((a, b) => (a.status === 'Ended' ? 1 : 0) - (b.status === 'Ended' ? 1 : 0) || b.startDate.localeCompare(a.startDate)),
    [state.tenancies, property.id],
  )
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<Tenancy | null>(null)
  const current = tenancies.filter((t) => t.status !== 'Ended')
  const past = tenancies.filter((t) => t.status === 'Ended')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="inline-flex items-center gap-2 font-display text-lg font-semibold text-ink">
            <Users className="h-5 w-5 text-primary" aria-hidden /> Tenants
          </h2>
          <p className="text-sm text-ink-500">Who lives here now. Already have a tenant in the property? Add them directly — no application needed.</p>
        </div>
        {canManage ? (
          <Button onClick={() => setAdding(true)}>
            <UserPlus className="h-4 w-4" aria-hidden /> Add tenant
          </Button>
        ) : null}
      </div>

      {current.length === 0 ? <Card className="p-6 text-sm text-ink-500">No current tenants.</Card> : null}
      <ul className="space-y-2">
        {current.map((t) => (
          <TenantRow key={t.id} t={t} canManage={canManage} onRemove={() => setRemoving(t)} />
        ))}
      </ul>
      {past.length ? (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium text-ink-600">Past tenants ({past.length})</summary>
          <ul className="mt-2 space-y-2">
            {past.map((t) => (
              <TenantRow key={t.id} t={t} canManage={false} onRemove={() => undefined} />
            ))}
          </ul>
        </details>
      ) : null}

      <AddTenantModal open={adding} onClose={() => setAdding(false)} property={property} />
      <RemoveTenantDialog tenancy={removing} onClose={() => setRemoving(null)} />
    </div>
  )
}

function TenantRow({ t, canManage, onRemove }: { t: Tenancy; canManage: boolean; onRemove: () => void }) {
  return (
    <li>
      <Card className="flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="min-w-0">
          <Link to={`/workspace/people/tenants/${encodeURIComponent(t.id)}`} className="font-semibold text-ink hover:text-primary">
            {t.tenantName}
          </Link>
          <p className="text-xs text-ink-500">
            {t.tenantEmail} · from {t.startDate}
            {t.endDate ? ` to ${t.endDate}` : ''} · {formatZAR(t.rent)} /month
            {t.directAdd?.roomLabel ? ` · ${t.directAdd.roomLabel}` : ''}
          </p>
          {t.directAdd ? (
            <p className="text-xs text-ink-500">
              Added directly by {t.directAdd.addedByName}
              {!t.directAdd.leaseSigned ? ' · no signed lease on file' : ''}
              {!t.directAdd.depositPaid ? ' · no deposit recorded' : ''}
              {t.directAdd.note ? ` · “${t.directAdd.note}”` : ''}
            </p>
          ) : null}
          {t.removal ? <p className="text-xs text-ink-500">Removed by {t.removal.removedByName}{t.removal.reason ? `: ${t.removal.reason}` : ''}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={t.status === 'Active' ? 'success' : t.status === 'Ended' ? 'neutral' : 'warning'}>{t.status}</Badge>
          {canManage && t.status !== 'Ended' ? (
            <Button size="sm" variant="ghost" onClick={onRemove}>
              Remove
            </Button>
          ) : null}
        </div>
      </Card>
    </li>
  )
}

function AddTenantModal({ open, onClose, property }: { open: boolean; onClose: () => void; property: PropertyAsset }) {
  const { addDirectTenant } = useStore()
  const { user } = useAuth()
  const today = new Date().toISOString().slice(0, 10)
  const blank = { name: '', email: '', phone: '', startDate: today, endDate: '', rent: String(property.rent || ''), deposit: String((property as { deposit?: number }).deposit ?? ''), roomLabel: '', note: '' }
  const [f, setF] = useState(blank)
  const [leaseSigned, setLeaseSigned] = useState(false)
  const [depositPaid, setDepositPaid] = useState(false)
  const [understood, setUnderstood] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof blank) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }))
  const missing = [!leaseSigned && 'no signed lease agreement', !depositPaid && 'no deposit paid'].filter(Boolean) as string[]
  const shared = /shared|room|commune/i.test(String(property.type))

  const close = () => {
    setF(blank)
    setLeaseSigned(false)
    setDepositPaid(false)
    setUnderstood(false)
    setError('')
    onClose()
  }
  const submit = async () => {
    setError('')
    if (!understood) return setError('Tick the box to confirm you understand the warning.')
    setBusy(true)
    const res = await addDirectTenant({
      propertyId: property.id,
      name: f.name,
      email: f.email,
      phone: f.phone,
      startDate: f.startDate || today,
      endDate: f.endDate || null,
      rent: Number(f.rent) || 0,
      deposit: Number(f.deposit) || 0,
      leaseSigned,
      depositPaid,
      note: f.note,
      roomLabel: f.roomLabel,
      actor: { userId: user.id, name: user.name },
    })
    setBusy(false)
    if (res.ok === false) return setError(res.error)
    await sweetSuccess('Tenant added', `${f.name} is now a tenant of ${property.title}. They can sign in to their tenant portal.`)
    close()
  }

  return (
    <Modal open={open} onClose={close} title="Add a tenant to this property" size="lg">
      <div className="space-y-4">
        <div className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" role="alert">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <div>
            <p className="font-semibold">Be careful when you add this tenant to your property.</p>
            <p className="mt-1">
              They skip the application: no screening, documents or approval. Only add someone who already lives here or has a signed agreement with you.
              {missing.length ? ` Right now there is ${missing.join(' and ')}.` : ''}
            </p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm"><span className="mb-1 block text-xs font-semibold text-ink-500">Full name</span><Input value={f.name} onChange={set('name')} /></label>
          <label className="text-sm"><span className="mb-1 block text-xs font-semibold text-ink-500">Email</span><Input type="email" value={f.email} onChange={set('email')} /></label>
          <label className="text-sm"><span className="mb-1 block text-xs font-semibold text-ink-500">Phone (optional)</span><Input value={f.phone} onChange={set('phone')} /></label>
          {shared ? (
            <label className="text-sm"><span className="mb-1 block text-xs font-semibold text-ink-500">Room</span><Input placeholder="e.g. Room 3" value={f.roomLabel} onChange={set('roomLabel')} /></label>
          ) : null}
          <label className="text-sm"><span className="mb-1 block text-xs font-semibold text-ink-500">Lease start</span><Input type="date" value={f.startDate} onChange={set('startDate')} /></label>
          <label className="text-sm"><span className="mb-1 block text-xs font-semibold text-ink-500">Lease end (optional)</span><Input type="date" value={f.endDate} onChange={set('endDate')} /></label>
          <label className="text-sm"><span className="mb-1 block text-xs font-semibold text-ink-500">Rent (R / month)</span><Input type="number" value={f.rent} onChange={set('rent')} /></label>
          <label className="text-sm"><span className="mb-1 block text-xs font-semibold text-ink-500">Deposit (R)</span><Input type="number" value={f.deposit} onChange={set('deposit')} /></label>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={leaseSigned} onChange={(e) => setLeaseSigned(e.target.checked)} /> A lease agreement has been signed</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={depositPaid} onChange={(e) => setDepositPaid(e.target.checked)} /> The deposit has been paid</label>
        </div>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-semibold text-ink-500">Note (optional) — why are you adding this tenant?</span>
          <Textarea rows={2} value={f.note} onChange={set('note')} placeholder="e.g. Existing tenant since 2023, moving the property onto Lekaya Rentals." />
        </label>
        <label className="flex items-start gap-2 text-sm text-ink">
          <input type="checkbox" className="mt-1" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
          I understand this tenant skips the application process.
        </label>
        {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={close}>Cancel</Button>
          <Button disabled={busy} onClick={() => void submit()}>{busy ? 'Adding…' : 'Add tenant'}</Button>
        </div>
      </div>
    </Modal>
  )
}
