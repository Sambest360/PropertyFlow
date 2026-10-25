/**
 * Every new application is filed as application_submitted — the server
 * (enforceApplicantApplicationWrite) refuses any other starting status.
 * Staff move it on with "Request documents".
 */
export function initialWorkflowForCreate(): { workflowStatus: 'application_submitted'; stage: string } {
  return { workflowStatus: 'application_submitted', stage: 'Application submitted' }
}
