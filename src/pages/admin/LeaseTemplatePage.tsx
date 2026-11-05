/**
 * Settings → Lease template. The agency writes its own lease with merge
 * fields; new leases use it. Leave it empty to use the standard Lekaya lease.
 * Signed leases keep the text they were signed on.
 */
import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../../context/AppStore'
import { useAgencyScope, useAuth } from '../../context/AuthContext'
import { RequirePermission } from '../../components/RequirePermission'
import { RichTextEditor } from '../../components/editor/RichTextEditor'
import { LeaseContractView } from '../../components/lease/LeaseDocument'
import { Button, Card, PageHeader, Select } from '../../components/ui'
import { realAgencies } from '../../lib/agencyKinds'
import { buildLeaseContract } from '../../lib/lease/leaseContract'
import { LEASE_MERGE_FIELDS, STARTER_LEASE_TEMPLATE, leaseTemplateIsEmpty, sanitizeLeaseHtml } from '../../lib/lease/leaseTemplate'
import { sweetSuccess } from '../../lib/sweetAlert'

export default function LeaseTemplatePage() {
  const { state, updateAgency } = useStore()
  const { user } = useAuth()
  const { agencyId } = useAgencyScope()
  const agencies = realAgencies(state.agencies)
  const isSuper = user.role === 'super_admin'
  const [target, setTarget] = useState<string>(agencyId ?? agencies[0]?.id ?? '')
  const agency = agencies.find((a) => a.id === target)
  const stored = agency?.settings?.leaseTemplate ?? ''
  const [html, setHtml] = useState(stored)
  const [dirty, setDirty] = useState(false)
  const [preview, setPreview] = useState(false)

  useEffect(() => {
    setHtml(stored)
    setDirty(false)
  }, [stored, target])

  const sample = useMemo(
    () =>
      buildLeaseContract({
        leaseReference: 'LEASE-SAMPLE',
        agencyName: agency?.tradingAs || agency?.name || 'Your agency',
        agencyContact: agency?.email ?? null,
        landlordName: 'Sample Landlord',
        tenantName: 'Sample Tenant',
        tenantEmail: 'tenant@example.com',
        propertyTitle: '2 bedroom apartment',
        propertyAddress: '12 Example Street, Suburb, City',
        startDate: '2026-12-01',
        endDate: '2027-11-30',
        rent: 9500,
        deposit: 9500,
        rentDueDay: 1,
        escalationPct: 8,
        parkingBays: 1,
        customTemplateHtml: html,
      }),
    [html, agency],
  )

  const save = async (next: string) => {
    if (!agency) return
    const clean = sanitizeLeaseHtml(next)
    updateAgency(agency.id, {
      settings: { ...agency.settings, leaseTemplate: clean, leaseTemplateSavedAt: new Date().toISOString() },
    })
    setDirty(false)
    await sweetSuccess(
      'Lease template saved',
      leaseTemplateIsEmpty(clean) ? 'New leases use the standard Lekaya lease.' : 'New leases use your template. Leases already signed keep their text.',
    )
  }

  return (
    <RequirePermission anyOf={['config.manage', 'tenant.manage', 'platform.manage']}>
      <div className="mx-auto max-w-5xl space-y-5 p-4 md:p-8">
        <PageHeader
          title="Lease template"
          subtitle="Write the lease your tenants sign. Fields such as {{tenantName}} fill in from the application. Leave it empty to use the standard Lekaya lease."
        />

        {isSuper && agencies.length > 1 ? (
          <Card className="p-4">
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold text-ink-500">Agency</span>
              <Select value={target} onChange={(e) => setTarget(e.target.value)}>
                {agencies.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </label>
          </Card>
        ) : null}

        {!agency ? (
          <Card className="p-6 text-sm text-ink-600">Choose an agency to edit its lease.</Card>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant={preview ? 'secondary' : 'primary'} size="sm" onClick={() => setPreview(false)}>
                Edit
              </Button>
              <Button variant={preview ? 'primary' : 'secondary'} size="sm" onClick={() => setPreview(true)}>
                Preview with sample details
              </Button>
              {leaseTemplateIsEmpty(html) ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setHtml(STARTER_LEASE_TEMPLATE)
                    setDirty(true)
                  }}
                >
                  Start from a starter lease
                </Button>
              ) : null}
            </div>

            {preview ? (
              <Card className="p-5">
                <LeaseContractView contract={sample} />
              </Card>
            ) : (
              <RichTextEditor
                label="Lease text"
                value={html}
                mergeFields={LEASE_MERGE_FIELDS}
                onChange={(next) => {
                  setHtml(next)
                  setDirty(true)
                }}
              />
            )}

            <p className="text-sm text-ink-500">
              Use <strong>Section heading</strong> for each numbered part of the lease; paragraphs and list items become its clauses. Have your attorney review the final text.
            </p>

            <div className="flex flex-wrap gap-2">
              <Button disabled={!dirty} onClick={() => void save(html)}>
                Save lease template
              </Button>
              {stored ? (
                <Button variant="ghost" onClick={() => void save('')}>
                  Use the standard Lekaya lease instead
                </Button>
              ) : null}
            </div>
          </>
        )}
      </div>
    </RequirePermission>
  )
}
