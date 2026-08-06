import { useEffect } from 'react'
import type { AppUser } from '../../types/domain'
import {
  agentsForProperty,
  shouldLockPropertyAgentField,
} from '../../lib/agentDisplay'
import { useAgentDisplay } from '../../hooks/useAgentDisplay'
import { Input, cn } from '../ui'

/** Property-scoped agent field — only the linked agent; hidden when the viewer is that agent. */
export function PropertyAgentField({
  propertyAgentId,
  agents,
  value,
  onChange,
  label = 'Agent',
  required,
  className,
}: {
  propertyAgentId: string | null | undefined
  agents: AppUser[]
  value: string
  onChange: (agentId: string) => void
  label?: string
  required?: boolean
  className?: string
}) {
  const { viewerId } = useAgentDisplay()
  const linked = agentsForProperty(propertyAgentId, agents)
  const linkedAgent = linked[0]
  const hidden = shouldLockPropertyAgentField(viewerId, propertyAgentId)

  useEffect(() => {
    if (propertyAgentId && value !== propertyAgentId) {
      onChange(propertyAgentId)
    }
  }, [propertyAgentId, value, onChange])

  if (hidden) return null

  if (!propertyAgentId || !linkedAgent) {
    return (
      <div className={className}>
        <p className="text-xs font-medium text-ink-500">
          {label}
          {required ? <span className="text-accent"> *</span> : null}
        </p>
        <p className="mt-1 text-sm text-amber-800">
          No agent is linked to this property. Assign an agent on the property first.
        </p>
      </div>
    )
  }

  return (
    <label className={cn('block text-xs font-medium text-ink-500', className)}>
      {label}
      {required ? <span className="text-accent"> *</span> : null}
      <Input
        className="mt-1 min-h-11"
        value={linkedAgent.name}
        readOnly
        disabled
        aria-readonly
        title="Agent is set from the property listing"
      />
    </label>
  )
}
