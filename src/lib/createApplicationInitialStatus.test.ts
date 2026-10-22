import { describe, expect, it } from 'vitest'
import { initialWorkflowForCreate } from './createApplicationInitialStatus'

describe('initialWorkflowForCreate', () => {
  it('uses documents_requested for listing-style submit without doc URLs', () => {
    expect(initialWorkflowForCreate({})).toEqual({
      workflowStatus: 'documents_requested',
      stage: 'Documents requested',
    })
  })

  it('uses application_submitted when doc URLs present', () => {
    expect(
      initialWorkflowForCreate({
        uploadedDocs: { idCopyUrl: 'https://example.com/id.pdf' },
      }),
    ).toEqual({
      workflowStatus: 'application_submitted',
      stage: 'Application submitted',
    })
  })
})
