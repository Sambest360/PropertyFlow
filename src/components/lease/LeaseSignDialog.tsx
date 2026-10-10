import { useEffect, useState } from 'react'
import type { Tenancy } from '../../types/domain'
import { Button, Modal } from '../ui'
import { LeaseSignPanel, useLeaseSignContext } from './LeaseSignPanel'
import { leaseSignCaptureError, type LeaseSignCapture, type SignParty } from '../../lib/lease/signaturePrefill'

export function LeaseSignDialog({
  open,
  tenancy,
  party,
  paper = false,
  busy,
  onClose,
  onSign,
}: {
  open: boolean
  tenancy: Tenancy | null
  party: SignParty
  paper?: boolean
  busy?: boolean
  onClose: () => void
  onSign: (capture: LeaseSignCapture & { signerName: string }) => void
}) {
  const context = useLeaseSignContext(tenancy, party, paper)
  const [capture, setCapture] = useState<LeaseSignCapture>({})
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (open) setError(null)
  }, [open])

  const title = paper
    ? `Mark ${party} signed (paper)`
    : party === 'tenant'
      ? 'Sign as tenant'
      : context.onBehalf
        ? 'Sign for landlord'
        : 'Sign as landlord'

  const submit = () => {
    const why = leaseSignCaptureError(capture, context)
    if (why) {
      setError(why)
      return
    }
    onSign({ ...capture, signerName: context.signerName })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="lg"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={busy || (context.staffOnTenant && !paper)}>
            {paper ? 'Mark signed' : 'Sign'}
          </Button>
        </>
      }
    >
      <LeaseSignPanel context={context} value={capture} onChange={setCapture} />
      {error ? (
        <p role="alert" className="mt-3 rounded-xl bg-accent-50 px-3 py-2 text-sm text-accent-900">
          {error}
        </p>
      ) : null}
    </Modal>
  )
}
