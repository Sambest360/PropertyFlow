/**
 * PCR on its own page (CR8). Same InspectionPcrPanel and the same save path
 * (updateApplication) as the applicant record — no new writer.
 */
import { useMemo } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { useStore } from '../context/AppStore'
import { useAuth, usePropertyScope } from '../context/AuthContext'
import { BackButton } from '../components/BackButton'
import { InspectionPcrPanel } from '../components/pcr/InspectionPcrPanel'
import { Card } from '../components/ui'

export default function ApplicationInspectionPage() {
  const { id } = useParams()
  const { state, updateApplication } = useStore()
  const { user, has } = useAuth()
  const { dealVisible } = usePropertyScope()

  const application = state.applications.find((a) => a.id === id)
  const property = useMemo(
    () =>
      application ? state.properties.find((p) => p.id === application.propertyId) ?? null : null,
    [application, state.properties],
  )

  const backTo = application
    ? `/workspace/sales/applications/${application.id}`
    : '/workspace/sales/applications'

  if (!application || application.type !== 'Rental') {
    return (
      <Card className="p-8 text-center">
        <p className="font-semibold text-ink">Inspection not available</p>
        <div className="mt-3 flex justify-center">
          <BackButton to={backTo} label="Back to applicant" />
        </div>
      </Card>
    )
  }

  if (!dealVisible(application)) {
    return <Navigate to="/workspace/sales/applications" replace />
  }

  return (
    <div className="space-y-4">
      <BackButton to={backTo} label={`Back to ${application.applicantName}`} />
      <InspectionPcrPanel
        application={application}
        propertyTitle={property?.title ?? 'Property'}
        propertyAddress={
          property
            ? [property.address, property.suburb, property.city].filter(Boolean).join(', ')
            : '—'
        }
        agencyName={state.agencies.find((a) => a.id === application.agencyId)?.name ?? 'Agency'}
        canReview={has('applications.review')}
        actor={{
          userId: user.id,
          name: state.users.find((u) => u.id === user.id)?.name ?? 'Staff',
        }}
        onSave={(patch) => updateApplication(application.id, patch)}
      />
    </div>
  )
}
