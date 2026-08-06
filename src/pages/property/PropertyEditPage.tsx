import { Navigate, useParams } from 'react-router-dom'
import { useStore } from '../../context/AppStore'
import { usePropertyScope } from '../../context/AuthContext'
import { canEditPropertyListing } from '../../components/property-detail/types'
import { isPropertyDeleted } from '../../lib/propertyDeletion'
import { PropertyWizardPage } from './PropertyCreatePage'

export default function PropertyEditPage() {
  const { id } = useParams()
  const { state } = useStore()
  const { inPropertyScope, canMutate } = usePropertyScope()

  const property = id ? state.properties.find((p) => p.id === id) : undefined

  if (!id || !property) {
    return <Navigate to="/workspace/properties" replace />
  }

  if (!inPropertyScope(property.id) || !canMutate(property.id)) {
    return <Navigate to={`/workspace/properties/${property.id}`} replace />
  }

  if (!canEditPropertyListing(property.status) || isPropertyDeleted(property)) {
    return <Navigate to={`/workspace/properties/${property.id}`} replace />
  }

  return <PropertyWizardPage editPropertyId={property.id} />
}
