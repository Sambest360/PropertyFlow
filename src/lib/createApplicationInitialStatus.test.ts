import { describe, expect, it } from 'vitest'
import { initialWorkflowForCreate } from './createApplicationInitialStatus'

describe('initialWorkflowForCreate', () => {
  it('files every new application as submitted, the only start the server accepts', () => {
    expect(initialWorkflowForCreate()).toEqual({
      workflowStatus: 'application_submitted',
      stage: 'Application submitted',
    })
  })
})
