-- 039: Application Pipeline seed. Platform-wide settings table plus the
-- default application lifecycle every agency starts from (Viewing,
-- Application submitted, Documents, Identity, Credit check, Agent review,
-- Approval, Deposit, Lease, Move-in). Super admins edit it in Settings ->
-- Application configuration; agencies customise their unlocked stages.
-- Add-only and safe to run again: an existing (edited) default is kept.

CREATE TABLE IF NOT EXISTS platform_settings (
  key         VARCHAR(80) PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  UUID REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO platform_settings (key, value)
VALUES ('application_pipeline_default', '{"version":1,"stages":[{"key":"viewing","label":"Viewing","kind":"viewing","locked":true,"enabled":true,"description":"The applicant viewed the property (in person or virtually).","checklist":["Applicant attended the viewing"]},{"key":"submitted","label":"Application submitted","kind":"submitted","locked":true,"enabled":true,"description":"The application form is complete."},{"key":"documents","label":"Documents","kind":"documents","locked":true,"enabled":true,"description":"Income and supporting documents are uploaded and verified.","requiredDocs":["payslips","bank","employment","credit_consent"]},{"key":"identity","label":"Identity","kind":"identity","locked":true,"enabled":true,"description":"ID, proof of address and FICA declaration are verified.","requiredDocs":["id","address","fica"]},{"key":"credit_check","label":"Credit check","kind":"credit_check","locked":false,"enabled":true,"description":"Run the credit check outside the system, then record the outcome and upload the report.","allowAttachments":true,"notesRequired":true},{"key":"agent_review","label":"Agent review","kind":"agent_review","locked":false,"enabled":true,"description":"The agent reviews affordability, references and the full file.","allowAttachments":true,"checklist":["Affordability checked","References checked"]},{"key":"approval","label":"Approval","kind":"approval","locked":false,"enabled":true,"description":"Approve the applicant. This creates the lease and the deposit and first rent invoices."},{"key":"deposit","label":"Deposit","kind":"deposit","locked":true,"enabled":true,"description":"The applicant pays the deposit and uploads proof; the agency confirms it."},{"key":"lease","label":"Lease","kind":"lease","locked":true,"enabled":true,"description":"Tenant and landlord sign the lease in the app (ECTA e-signature)."},{"key":"move_in","label":"Move-in","kind":"move_in","locked":true,"enabled":true,"description":"Incoming inspection signed and keys handed over.","checklist":["Incoming inspection completed","Keys handed over"]}]}'::jsonb)
ON CONFLICT (key) DO NOTHING;
