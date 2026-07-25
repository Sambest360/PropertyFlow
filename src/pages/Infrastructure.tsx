import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Building2,
  Droplets,
  MapPin,
  Plus,
  Search,
  Sun,
  Layers,
} from 'lucide-react'
import { useStore } from '../context/AppStore'
import { useAgencyScope, useAuth } from '../context/AuthContext'
import { ImageDropzone } from '../components/ImageDropzone'
import { Badge, Button, Card, Input, PageHeader, Select } from '../components/ui'
import { isFieldAgent } from '../lib/permissions'

export default function InfrastructurePage() {
  const navigate = useNavigate()
  const { state, createBuilding } = useStore()
  const { has, agencyId, user } = useAuth()
  const { scopeAgency, scopeLandlord, role } = useAgencyScope()
  const [q, setQ] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({
    name: '',
    addressLine1: '',
    suburb: '',
    city: 'Johannesburg',
    province: 'Gauteng',
    grading: 'A' as 'P' | 'A' | 'B' | 'C',
    solarCapacityKw: '0',
    hasBorehole: false,
  })
  const [images, setImages] = useState<string[]>([])

  const buildings = useMemo(() => {
    return state.buildings.filter((b) => {
      if (!scopeAgency(b.clientId)) return false
      if (role === 'landlord' && !scopeLandlord(b.landlordId ?? '')) return false
      if (isFieldAgent(role)) {
        const assigned = state.units.some((u) => u.buildingId === b.id && u.agentId === user.id)
        if (!assigned && role === 'ground_agent') return false
      }
      const hay = `${b.name} ${b.suburb} ${b.city}`.toLowerCase()
      return !q || hay.includes(q.toLowerCase())
    })
  }, [state.buildings, state.units, q, scopeAgency, scopeLandlord, role, user.id])

  const onCreate = () => {
    if (!form.name.trim() || !agencyId) return
    if (images.length === 0) return
    const b = createBuilding({
      clientId: agencyId,
      landlordId: state.users.find((u) => u.role === 'landlord' && u.agencyId === agencyId)?.id ?? null,
      name: form.name.trim(),
      addressLine1: form.addressLine1.trim() || 'Address TBC',
      suburb: form.suburb.trim() || form.city,
      city: form.city,
      province: form.province,
      grading: form.grading,
      solarCapacityKw: Number(form.solarCapacityKw) || 0,
      hasBorehole: form.hasBorehole,
      lat: -26.2,
      lng: 28.0,
      images,
    })
    setShowCreate(false)
    setImages([])
    setForm({
      name: '',
      addressLine1: '',
      suburb: '',
      city: 'Johannesburg',
      province: 'Gauteng',
      grading: 'A',
      solarCapacityKw: '0',
      hasBorehole: false,
    })
    navigate(`/workspace/properties/infrastructure/${b.id}`)
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Infrastructure OS"
        subtitle="Buildings → units → rooms → inventory. Treat property as hierarchical infrastructure, not flat ads."
        actions={
          has('assets.manage') ? (
            <Button type="button" onClick={() => setShowCreate((s) => !s)}>
              <Plus className="h-4 w-4" /> New building
            </Button>
          ) : undefined
        }
      />

      {showCreate && (
        <Card className="mb-5 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block sm:col-span-2">
            <span className="text-xs font-medium text-ink-500">Building name</span>
            <Input
              className="mt-1 min-h-11"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Rivonia Courtyard"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-ink-500">Street address</span>
            <Input
              className="mt-1 min-h-11"
              value={form.addressLine1}
              onChange={(e) => setForm((f) => ({ ...f, addressLine1: e.target.value }))}
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-ink-500">Suburb</span>
            <Input
              className="mt-1 min-h-11"
              value={form.suburb}
              onChange={(e) => setForm((f) => ({ ...f, suburb: e.target.value }))}
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-ink-500">City</span>
            <Input
              className="mt-1 min-h-11"
              value={form.city}
              onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-ink-500">Province</span>
            <Select
              className="mt-1 min-h-11 w-full"
              value={form.province}
              onChange={(e) => setForm((f) => ({ ...f, province: e.target.value }))}
            >
              {['Gauteng', 'Western Cape', 'KwaZulu-Natal', 'Eastern Cape', 'Free State'].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </Select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-ink-500">Grading</span>
            <Select
              className="mt-1 min-h-11 w-full"
              value={form.grading}
              onChange={(e) => setForm((f) => ({ ...f, grading: e.target.value as 'P' | 'A' | 'B' | 'C' }))}
            >
              {['P', 'A', 'B', 'C'].map((g) => (
                <option key={g}>{g}</option>
              ))}
            </Select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-ink-500">Solar capacity (kW)</span>
            <Input
              className="mt-1 min-h-11 tabular"
              value={form.solarCapacityKw}
              onChange={(e) => setForm((f) => ({ ...f, solarCapacityKw: e.target.value }))}
            />
          </label>
          <label className="flex min-h-11 items-center gap-2 pt-5 text-sm text-ink">
            <input
              type="checkbox"
              checked={form.hasBorehole}
              onChange={(e) => setForm((f) => ({ ...f, hasBorehole: e.target.checked }))}
            />
            Borehole on site
          </label>
          <div className="sm:col-span-2 lg:col-span-3">
            <ImageDropzone
              label="Building photos"
              value={images}
              onChange={setImages}
              multiple
              max={8}
              hint="Drag & drop photos here, or click to open your gallery"
            />
          </div>
          <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-3">
            {images.length === 0 && (
              <p className="w-full text-xs font-medium text-accent">Add at least one photo to create the building.</p>
            )}
            <Button type="button" onClick={onCreate} disabled={images.length === 0}>
              Create building
            </Button>
            <Button type="button" variant="secondary" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      <Card className="mb-5 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <Input
            className="min-h-11 pl-9"
            placeholder="Search buildings in your portfolio…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </Card>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {buildings.map((b) => {
          const units = state.units.filter((u) => u.buildingId === b.id)
          const assets = state.internalAssets.filter((a) => units.some((u) => u.id === a.unitId))
          return (
            <Link key={b.id} to={`/workspace/properties/infrastructure/${b.id}`} className="group block">
              <Card hover className="overflow-hidden">
                <div className="relative aspect-[16/10] bg-primary-50">
                  {b.images[0] ? (
                    <img src={b.images[0]} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-ink-400">No photo</div>
                  )}
                  <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
                    {b.grading && <Badge tone="brand">Grade {b.grading}</Badge>}
                    {b.solarCapacityKw > 0 && (
                      <Badge tone="success">
                        <Sun className="mr-1 inline h-3 w-3" />
                        {b.solarCapacityKw} kW
                      </Badge>
                    )}
                    {b.hasBorehole && (
                      <Badge tone="info">
                        <Droplets className="mr-1 inline h-3 w-3" />
                        Borehole
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="flex items-center gap-2 font-semibold text-ink">
                    <Building2 className="h-4 w-4 text-primary" />
                    {b.name}
                  </h3>
                  <p className="mt-1 flex items-center gap-1 text-xs text-ink-500">
                    <MapPin className="h-3.5 w-3.5" />
                    {b.suburb}, {b.city}
                  </p>
                  <div className="mt-3 flex gap-3 text-xs text-ink-500">
                    <span className="inline-flex items-center gap-1">
                      <Layers className="h-3.5 w-3.5" /> {units.length} units
                    </span>
                    <span>{assets.length} assets</span>
                  </div>
                </div>
              </Card>
            </Link>
          )
        })}
      </div>

      {buildings.length === 0 && (
        <Card className="p-10 text-center">
          <p className="font-semibold text-ink">No buildings in scope</p>
          <p className="mt-1 text-sm text-ink-500">Create a building, then add units from templates in one click.</p>
        </Card>
      )}
    </div>
  )
}
