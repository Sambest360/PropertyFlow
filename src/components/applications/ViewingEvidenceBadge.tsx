import { viewingEvidenceLabel } from '../../lib/applyEligibility'
import type { ViewingEvidence } from '../../lib/applyEligibility'
import { Badge } from '../ui'

export function ViewingEvidenceBadge({ evidence }: { evidence?: ViewingEvidence | null }) {
  const label = viewingEvidenceLabel(evidence)
  if (!label) return null
  const tone = evidence?.kind === 'override' ? 'warning' : evidence?.kind === 'virtual' ? 'neutral' : 'success'
  return <Badge tone={tone}>{label}</Badge>
}
