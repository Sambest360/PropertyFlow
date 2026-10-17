# FICA pack — Mode A (DQ-C2)

Lekaya’s FICA pack is a **staff-managed in-app checklist** (ID, proof of
address, FICA declaration). That path must **never** be claimed as live bureau
screening or live FICA verification.

## What Mode A ships

| Surface | Behaviour |
| --- | --- |
| Documents / lifecycle FICA stage | Staff upload/review ID, address, and FICA rows independently |
| `START_FICA` | Opens the FICA pack review stage only — **does not** invent verified status |
| Soft gate | Lease create / move-in / activate blocked until `id` + `address` + `fica` are **staff-verified** |
| Honesty banner | Mode A copy on Documents + Lifecycle (rental) |

## Safe claims

- **OK:** “Staff can manage the FICA pack honestly; lease/move-in soft-gated on verified id+address+fica.”
- **OK:** “START_FICA no longer auto-verifies documents.”
- **Not OK:** “Live bureau / live FICA verification.”
- **Not OK:** Claiming live TPN (DQ-C3 Mode A is soft-gate + mock/manual — see docs/screening-mode-a.md).

## OUT (Mode A)

- Live FICA / bureau integrations
- Council certs
- Live TPN HTTP (DQ-C3 Mode A ships soft-gate + mock/manual only — see docs/screening-mode-a.md)
- Seed data
