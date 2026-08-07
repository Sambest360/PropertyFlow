import type { Application, ApplicationWorkflowEvent } from '../types/domain'
import { uid } from '../data/seed'

export function appendWorkflowEvent(
  app: Application,
  input: Omit<ApplicationWorkflowEvent, 'id' | 'applicationId' | 'at'> & { at?: string },
): Application {
  const event: ApplicationWorkflowEvent = {
    id: uid('WFE'),
    applicationId: app.id,
    at: input.at ?? new Date().toISOString(),
    stage: input.stage,
    actionKey: input.actionKey,
    actorUserId: input.actorUserId,
    actorName: input.actorName,
    summary: input.summary,
    payload: input.payload,
  }
  return {
    ...app,
    workflowEvents: [...(app.workflowEvents ?? []), event],
  }
}
