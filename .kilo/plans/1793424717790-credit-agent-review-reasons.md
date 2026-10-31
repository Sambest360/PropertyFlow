# Plan: Deposit invoice, lease sent, active tenancy/move-in functional for agent & tenant

## Goal
Make the post-approval lease/deposit/move-in flow fully operable by agency admin and tenant: admin issues deposit invoice with agency bank details; tenant sees deposit details, uploads proof; admin confirms; lease sent & signed; active tenancy/move-in.

## Scope
- Agency admin can set agency deposit/banking details (bank name, account, branch, reference format).
- Agent issues deposit invoice from application (`ISSUE_DEPOSIT_INVOICE`), injecting agency bank details.
- Tenant can view deposit invoice + agency bank details, upload deposit confirmation/proof.
- Agent can mark deposit paid / verify (`CONFIRM_DEPOSIT_PAID`, `VERIFY_DEPOSIT`).
- Lease generated/sent/signed flows already exist; ensure tenant + agent can act (sign, mark signed).
- Move-in / active tenancy (`keys_handed_over`, `active_tenancy`, `schedule_move_in`) operable by agent and tenant where applicable.

## Affected areas
- `src/lib/applicationWorkflow.ts` — transitions & guards (already present; ensure permissions allow agent+tenant).
- `src/pages/ApplicantDetail.tsx`, `src/pages/tenant/TenantApplicationDetailPage.tsx` — UI actions.
- `src/components/workflow/ApplicationLifecycleHub.tsx` — lifecycle buttons + reason dialogs.
- Server settings/agency profile endpoints — store deposit banking info.
- `server/writes.ts` / persist — deposit proof upload handling.
- `src/lib/applicantPortalActions.ts` — tenant-side actions.

## Tasks
1. Add agency deposit settings (bank details) to agency profile + admin UI; persist via existing agency settings route.
2. Deposit invoice issue flow: agent button already exists; include bank details in invoice payload / view.
3. Tenant deposit proof upload: add upload control on tenant application detail when `deposit_invoice_sent`; store file + reference; notify agent.
4. Agent verification: button to confirm deposit paid after proof; guard checks proof exists (or manual override with reason).
5. Lease flow: ensure tenant can sign in portal; agent can mark paper signed; both visible.
6. Move-in: agent records keys handed over + move-in date; tenant acknowledges; transition to active_tenancy.
7. Permissions: allow `portal.tenant` for tenant actions and `applications.review` for agent actions; dual-control where money involved.
8. Audit: event_log entries for deposit proof, verification, move-in.

## Risks
- Money handling: deposit proof != verified payment; keep verify step separate.
- File upload storage and retention.
- Tenant access gating: only conditionally_approved/deposit_invoice_sent stages.

## Open questions
- Should deposit proof be required before agent can verify, or allow manual override with reason? (Recommend: allow override with reason, audited.)
- Should move-in require inspection completion? (Recommend: yes, guard.)
