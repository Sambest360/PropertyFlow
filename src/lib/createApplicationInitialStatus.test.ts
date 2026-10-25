import { describe, expect, it } from 'vitest'
import { initialWorkflowForCreate } from './createApplicationInitialStatus'

describe('initialWorkflowForCreate', () => {
  it('starts a rental as submitted and a purchase as a submitted offer (the only starts the server accepts)', () => {
    expect(initialWorkflowForCreate('Rental')).toEqual({
      workflowStatus: 'application_submitted',
      stage: 'Application submitted',
    })
    expect(initialWorkflowForCreate('Purchase')).toEqual({
      workflowStatus: 'offer_submitted',
      stage: 'Offer submitted',
    })
  })
})
