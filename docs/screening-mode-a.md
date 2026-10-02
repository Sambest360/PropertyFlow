# Screening / TPN — Mode A (DQ-C3)

PropertyFlow’s tenant screening path is **staff-managed in-app**: POPIA consent,
mock provider ingest, and audited manual bureau override. That path must
**never** be claimed as live TPN or a live bureau hard-gate.

## What Mode A ships

| Surface | Behaviour |
| --- | --- |
| Consent | Staff / portal capture POPIA credit-check consent before start |
| Start | `MockDevScreeningProvider` (no network); `TpnScreeningProviderPlaceholder` refuse-closed |
| Manual override | Audited reason required; optional staff score / external ref |
| Soft gate | Approve / lease / move-in blocked until screening is `passed` **or** `manual_override` |
| Invent-kill | Approve / workflow jump must **not** invent `Passed` |
| Honesty banner | Mode A copy on Screening details + Lifecycle (rental) |
| `START_CREDIT_CHECK` | Consent + mock/manual — **not** live bureau |

## Safe claims

- **OK:** “Staff consent + mock/manual bureau outcome; soft-gate approve/lease until passed or audited override.”
- **OK:** “Approve does not invent Passed.”
- **Not OK:** “Live TPN / bureau cleared from staff click alone.”
- **Not OK:** Pretending success when `SCREENING_PROVIDER=tpn`.

## OUT (Mode A)

- Live TPN HTTP
- Inventing credentials or Passed on approve
- Other bureaus beyond the TPN placeholder
