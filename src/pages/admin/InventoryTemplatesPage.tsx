import { useEffect, useState } from 'react'
import { RequirePermission } from '../../components/RequirePermission'
import { Button, Card, PageHeader } from '../../components/ui'
import { inspectionApi } from '../../lib/inspections/api'
import { defaultInventoryTemplate, type InventoryPropertyType, type InventoryTemplateItem } from '../../lib/inspections/templates'

const TYPES: InventoryPropertyType[] = ['house', 'apartment', 'room']

export default function InventoryTemplatesPage() {
  const [propertyType, setPropertyType] = useState<InventoryPropertyType>('apartment')
  const [items, setItems] = useState<InventoryTemplateItem[]>(defaultInventoryTemplate('apartment'))
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    inspectionApi<{ templates?: Array<{ property_type: string; items: InventoryTemplateItem[] }> }>('/api/inventory-templates')
      .then((body) => {
        const match = body.templates?.find((row) => row.property_type === propertyType)
        if (!cancelled && match?.items?.length) setItems(match.items)
      })
      .catch(() => {
        /* defaults stay on screen when the API is offline */
      })
    return () => {
      cancelled = true
    }
  }, [propertyType])

  function choose(next: InventoryPropertyType) {
    setPropertyType(next)
    setItems(defaultInventoryTemplate(next))
    setMessage(null)
  }

  async function save() {
    setError(null)
    setMessage(null)
    try {
      await inspectionApi('/api/inventory-templates', {
        method: 'POST',
        body: JSON.stringify({ propertyType, items }),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the template')
      return
    }
    setMessage('Template saved for this agency.')
  }

  return (
    <RequirePermission anyOf={['config.manage', 'tenant.manage', 'platform.manage']}>
      <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
        <PageHeader
          title="Inventory templates"
          subtitle="House, apartment, and room checklists used to fill a unit inventory."
        />
        <Card className="space-y-4 p-4">
          <div className="flex flex-wrap gap-2">
            {TYPES.map((type) => (
              <Button
                key={type}
                type="button"
                variant={type === propertyType ? 'primary' : 'secondary'}
                className="min-h-11 capitalize"
                onClick={() => choose(type)}
              >
                {type}
              </Button>
            ))}
          </div>
          <ul className="space-y-2">
            {items.map((item, index) => (
              <li key={index} className="grid gap-2 sm:grid-cols-[1fr_1fr_5rem]">
                <input
                  className="min-h-11 rounded-xl border border-primary-100 px-3 text-sm"
                  value={item.room}
                  aria-label={`Room ${index + 1}`}
                  onChange={(e) => {
                    const next = [...items]
                    next[index] = { ...item, room: e.target.value }
                    setItems(next)
                  }}
                />
                <input
                  className="min-h-11 rounded-xl border border-primary-100 px-3 text-sm"
                  value={item.name}
                  aria-label={`Item ${index + 1}`}
                  onChange={(e) => {
                    const next = [...items]
                    next[index] = { ...item, name: e.target.value }
                    setItems(next)
                  }}
                />
                <input
                  type="number"
                  min={1}
                  className="min-h-11 rounded-xl border border-primary-100 px-3 text-sm tabular"
                  value={item.quantity}
                  aria-label={`Quantity ${index + 1}`}
                  onChange={(e) => {
                    const next = [...items]
                    next[index] = { ...item, quantity: Math.max(1, Number(e.target.value) || 1) }
                    setItems(next)
                  }}
                />
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              className="min-h-11"
              onClick={() => setItems([...items, { room: 'Room', name: 'New item', quantity: 1 }])}
            >
              Add item
            </Button>
            <Button type="button" className="min-h-11" onClick={() => void save()}>
              Save template
            </Button>
          </div>
          {message && <p className="text-sm text-ink">{message}</p>}
          {error && <p className="text-sm text-red-700">{error}</p>}
        </Card>
      </div>
    </RequirePermission>
  )
}
