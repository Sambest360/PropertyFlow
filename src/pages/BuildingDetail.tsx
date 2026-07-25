import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  BedDouble,
  Box,
  Droplets,
  Plus,
  Sun,
  Wrench,
} from 'lucide-react'
import { useStore } from '../context/AppStore'
import { useAuth } from '../context/AuthContext'
import { FloorPlanCanvas } from '../components/infrastructure/FloorPlanCanvas'
import { Badge, Button, Card, Input, PageHeader, Select, cn } from '../components/ui'
import { UNIT_TEMPLATES, roomKindLabel, type UnitListingType } from '../data/infrastructure'
import { formatZAR } from '../data/seed'

export default function BuildingDetailPage() {
  const { buildingId } = useParams()
  const navigate = useNavigate()
  const { state, createUnitFromTemplate, updateInternalAsset } = useStore()
  const { has, user } = useAuth()
  const building = state.buildings.find((b) => b.id === buildingId)

  const units = useMemo(
    () => state.units.filter((u) => u.buildingId === buildingId),
    [state.units, buildingId],
  )
  const [unitId, setUnitId] = useState<string | null>(null)
  const activeUnitId = unitId && units.some((u) => u.id === unitId) ? unitId : units[0]?.id ?? null
  const activeUnit = units.find((u) => u.id === activeUnitId) ?? null

  const rooms = useMemo(
    () => state.infraRooms.filter((r) => r.unitId === activeUnitId),
    [state.infraRooms, activeUnitId],
  )
  const assets = useMemo(
    () => state.internalAssets.filter((a) => a.unitId === activeUnitId),
    [state.internalAssets, activeUnitId],
  )
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null)
  const selectedRoom = rooms.find((r) => r.id === selectedRoomId) ?? null
  const roomAssets = assets.filter((a) => (selectedRoomId ? a.roomId === selectedRoomId : true))

  const [wizardOpen, setWizardOpen] = useState(false)
  const [templateId, setTemplateId] = useState(UNIT_TEMPLATES[1].id)
  const [unitNumber, setUnitNumber] = useState('')
  const [title, setTitle] = useState('')
  const [listingType, setListingType] = useState<UnitListingType>('rent')
  const [price, setPrice] = useState('')
  const [rent, setRent] = useState('15000')

  if (!building) {
    return (
      <Card className="p-10 text-center">
        <p className="font-semibold">Building not found</p>
        <Link to="/workspace/properties/infrastructure" className="mt-3 inline-block text-sm font-semibold text-primary">
          Back to infrastructure
        </Link>
      </Card>
    )
  }

  const createUnit = () => {
    if (!unitNumber.trim() || !title.trim()) return
    const unit = createUnitFromTemplate({
      buildingId: building.id,
      templateId,
      unitNumber: unitNumber.trim(),
      title: title.trim(),
      listingType,
      price: price ? Number(price) : null,
      rent: rent ? Number(rent) : null,
      agentId: user.id,
    })
    setWizardOpen(false)
    setUnitId(unit.id)
    setUnitNumber('')
    setTitle('')
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={building.name}
        subtitle={`${building.addressLine1}, ${building.suburb}, ${building.city}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => navigate('/workspace/properties/infrastructure')}>
              <ArrowLeft className="h-4 w-4" /> All buildings
            </Button>
            {has('assets.manage') && (
              <Button type="button" onClick={() => setWizardOpen((o) => !o)}>
                <Plus className="h-4 w-4" /> Add unit from template
              </Button>
            )}
          </div>
        }
      />

      <div className="mb-5 flex flex-wrap gap-2">
        {building.grading && <Badge tone="brand">Grade {building.grading}</Badge>}
        {building.solarCapacityKw > 0 && (
          <Badge tone="success">
            <Sun className="mr-1 inline h-3.5 w-3.5" />
            {building.solarCapacityKw} kW solar
          </Badge>
        )}
        {building.hasBorehole && (
          <Badge tone="info">
            <Droplets className="mr-1 inline h-3.5 w-3.5" />
            Borehole
          </Badge>
        )}
        <Badge tone="neutral">{units.length} units</Badge>
      </div>

      {wizardOpen && (
        <Card className="mb-6 p-5">
          <h3 className="font-semibold text-ink">Quick-create unit</h3>
          <p className="mt-1 text-sm text-ink-500">
            Pick a layout template — rooms and starter inventory are generated automatically. No repetitive typing.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {UNIT_TEMPLATES.filter((t) => t.id !== 'custom').map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTemplateId(t.id)
                  if (!title) setTitle(`${building.name} — ${t.label}`)
                }}
                className={cn(
                  'min-h-[96px] cursor-pointer rounded-2xl border p-3 text-left transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  templateId === t.id
                    ? 'border-primary bg-primary-50'
                    : 'border-primary-100 bg-white hover:bg-primary-50/60',
                )}
              >
                <p className="text-sm font-semibold text-ink">{t.label}</p>
                <p className="mt-1 text-xs text-ink-500">{t.blurb}</p>
                <p className="mt-2 text-[11px] tabular text-ink-400">
                  {t.rooms.length} rooms · {t.starterAssets.length} assets
                </p>
              </button>
            ))}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block">
              <span className="text-xs font-medium text-ink-500">Unit number</span>
              <Input className="mt-1 min-h-11" value={unitNumber} onChange={(e) => setUnitNumber(e.target.value)} placeholder="B12" />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-xs font-medium text-ink-500">Listing title</span>
              <Input className="mt-1 min-h-11" value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-ink-500">Listing type</span>
              <Select
                className="mt-1 min-h-11 w-full"
                value={listingType}
                onChange={(e) => setListingType(e.target.value as UnitListingType)}
              >
                <option value="rent">To rent</option>
                <option value="sale">For sale</option>
                <option value="both">Sale or rent</option>
                <option value="not_listed">Not listed</option>
              </Select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-ink-500">Sale price (ZAR)</span>
              <Input className="mt-1 min-h-11 tabular" value={price} onChange={(e) => setPrice(e.target.value)} />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-ink-500">Monthly rent (ZAR)</span>
              <Input className="mt-1 min-h-11 tabular" value={rent} onChange={(e) => setRent(e.target.value)} />
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <Button type="button" onClick={createUnit}>
              Generate unit + inventory
            </Button>
            <Button type="button" variant="secondary" onClick={() => setWizardOpen(false)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {units.map((u) => (
          <button
            key={u.id}
            type="button"
            onClick={() => {
              setUnitId(u.id)
              setSelectedRoomId(null)
            }}
            className={cn(
              'min-h-11 cursor-pointer rounded-full px-4 py-2 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              activeUnitId === u.id ? 'bg-primary text-white' : 'bg-white text-ink ring-1 ring-primary-200 hover:bg-primary-50',
            )}
          >
            {u.unitNumber}
            <span className="ml-2 text-xs font-medium opacity-80">{u.statusKey.replace(/_/g, ' ')}</span>
          </button>
        ))}
      </div>

      {!activeUnit ? (
        <Card className="p-10 text-center">
          <p className="font-semibold">No units yet</p>
          <p className="mt-1 text-sm text-ink-500">Use a template to spin up rooms and inventory in seconds.</p>
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
          <FloorPlanCanvas
            rooms={rooms}
            assets={assets}
            selectedRoomId={selectedRoomId}
            onSelectRoom={setSelectedRoomId}
          />

          <div className="space-y-4">
            <Card className="p-4">
              <h3 className="font-semibold text-ink">{activeUnit.title}</h3>
              <p className="mt-1 text-sm text-ink-500">{activeUnit.description}</p>
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-ink-500">
                <span className="inline-flex items-center gap-1">
                  <BedDouble className="h-3.5 w-3.5" /> {activeUnit.bedrooms} bed
                </span>
                <span>{activeUnit.bathrooms} bath</span>
                <span className="tabular">{activeUnit.squareMeters} m²</span>
              </div>
              <p className="mt-3 text-lg font-bold tabular text-ink">
                {activeUnit.price
                  ? formatZAR(activeUnit.price)
                  : activeUnit.rent
                    ? `${formatZAR(activeUnit.rent)} / mo`
                    : '—'}
              </p>
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="inline-flex items-center gap-2 font-semibold text-ink">
                  <Box className="h-4 w-4 text-primary" />
                  {selectedRoom ? `${selectedRoom.name} inventory` : 'Unit inventory'}
                </h3>
                {selectedRoom && (
                  <Badge tone="neutral">{roomKindLabel(selectedRoom.kind)}</Badge>
                )}
              </div>
              <ul className="mt-3 space-y-2">
                {roomAssets.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-start justify-between gap-3 rounded-xl border border-primary-100 bg-primary-50/40 px-3 py-2.5"
                  >
                    <div>
                      <p className="text-sm font-semibold text-ink">
                        {a.itemName}
                        {a.brand ? <span className="font-medium text-ink-500"> · {a.brand}</span> : null}
                      </p>
                      <p className="text-xs text-ink-500">
                        {a.assetTypeKey.replace(/_/g, ' ')}
                        {a.serialNumber ? ` · SN ${a.serialNumber}` : ''}
                      </p>
                    </div>
                    <Select
                      className="h-9 min-w-[8.5rem] text-xs"
                      value={a.condition}
                      onChange={(e) => updateInternalAsset(a.id, { condition: e.target.value as typeof a.condition })}
                      disabled={!has('assets.manage')}
                    >
                      {['Excellent', 'Good', 'Fair', 'Damaged', 'Needs replacement'].map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </Select>
                  </li>
                ))}
                {roomAssets.length === 0 && (
                  <li className="py-6 text-center text-sm text-ink-500">No assets in this view</li>
                )}
              </ul>
              {assets.some((a) => a.condition === 'Damaged' || a.condition === 'Needs replacement') && (
                <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-accent">
                  <Wrench className="h-3.5 w-3.5" />
                  Damaged items can be linked to maintenance tickets
                </p>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
