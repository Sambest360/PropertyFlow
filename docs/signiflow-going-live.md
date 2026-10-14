# SigniFlow — Going Live (DQ-C1 Mode A)

Letkaya soft-demo e-sign is the **mock** provider (non-production, staff-click
countersign in People → Leases). That path must **never** be claimed as a legally
executed lease.

## What Mode A ships

| Path | Behaviour |
| --- | --- |
| `ESIGN_PROVIDER=mock` (default) | In-app mock envelopes. Soft-demo only. |
| `ESIGN_PROVIDER=signiflow` + server keys | Real WorkFlow HTTP: **CreateWorkflow** (base64 PDF) → **AddWorkflowStepV2** (signers) → **InitiateFlow**. |
| Keys missing / wrong provider | Honest refuse (`501`) — PDF may still generate; envelope is not invented. |
| DocuSign | Still a **placeholder** (Mode A OUT). |

Official WorkFlow REST base:

`https://{serverUrl}/API/SignFlowAPIServiceRest.svc`

Docs: [SigniFlow WorkFlow API](https://developers.signiflow.com/docs/signiflow-openapi/c132ea1d2f673-work-flow-api)

South Africa cloud is often:

`https://flow.signflow.co.za/API/SignFlowAPIServiceRest.svc`

## Server-only secrets (never `VITE_*`)

```bash
ESIGN_PROVIDER=signiflow
ESIGN_SIGNIFLOW_API_KEY=          # TokenField.TokenField from SigniFlow
ESIGN_SIGNIFLOW_API_URL=https://flow.signflow.co.za/API/SignFlowAPIServiceRest.svc
# Optional:
ESIGN_SIGNIFLOW_TOKEN_EXPIRY=2030-12-31T23:59:59Z
ESIGN_SIGNIFLOW_WEBHOOK_SECRET=   # for POST /api/esign/webhook
```

Optional client hint only (no secrets): `VITE_ESIGN_PROVIDER=signiflow` so the FE
calls `/api/esign/create-envelope` instead of mock. **Do not** set
`VITE_ESIGN_SIGNIFLOW_API_KEY` or any other partner secret in Vite.

## API routes

| Method | Path | Role |
| --- | --- | --- |
| GET | `/api/esign/provider` | Honesty / config status (no secrets) |
| POST | `/api/esign/create-envelope` | Create + initiate SigniFlow workflow when live |
| POST | `/api/esign/status` | `GetDocStatus` poll — partner truth only |
| POST | `/api/esign/webhook` | **PARTIAL**: shape-validate (+ optional secret); `persisted: false` until partner persistence lands |

## Safe claims

- **OK:** “SigniFlow HTTP runs when server keys are present; otherwise mock or honest refuse.”
- **OK:** “Mock e-sign is non-production soft-demo.”
- **Not OK:** “Every lease is legally executed” from mock envelope IDs or staff-click alone.
- **Not OK:** Claiming DocuSign is live.

## Checklist before flipping live

1. Obtain SigniFlow API token + confirm instance URL (SA / EU / etc.).
2. Set server env on the API host (Vercel/server) — redeploy so `process.env` picks them up.
3. Keep demo / staging on `ESIGN_PROVIDER=mock` until a real CreateWorkflow/InitiateFlow succeeds in a non-prod tenant.
4. Confirm webhook persistence (still PARTIAL) before relying on partner callbacks for workflow stages.
