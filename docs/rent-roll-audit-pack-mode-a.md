# Rent roll as-at + soft audit pack — Mode A (Michael GO + Jim stamp / Oscar §5)

Lekaya’s year-ops financial path ships an **as-at rent roll (CSV + PDF)** and a
**soft audit pack** beside Mode A owner statements (DQ-M3) and Trust soft CSV (DQ-M1).
That path must **never** be claimed as trust-audited, a PPRA opinion, bank-confirmed,
or live PayProp remittance.

## What Mode A ships

| Surface | Behaviour |
| --- | --- |
| As-at rent roll | Point-in-time rows from in-app tenancies (start ≤ as-at ≤ end) |
| Rent roll CSV / PDF | Downloadable; arrears from in-app Due/Overdue only |
| Soft audit pack | Index + rent roll + Trust soft CSV + documents inventory + optional DQ-M3 owner statement PDFs |
| Remittance adapter | `ManualSoftRemittanceAdapter` + `RefuseClosedRemittanceAdapter` (PayProp / bank feed) |
| Honesty banner | Mode A copy on Owner Portal / Landlords Directory |
| Reuse | Owner statement PDF (DQ-M3) + `trustTransactionsToCsv` — not rebuilt |

## Safe claims

- **OK:** “Rent roll + soft audit pack beside Mode A owner statements — not trust-audited.”
- **OK:** “As-at in-app book / soft pack — not PPRA opinion / not bank-confirmed.”
- **Not OK:** “Trust-audited” / PPRA-certified / auditor-ready pack.
- **Not OK:** “Bank-matched” or live PayProp remittance.

## OUT (Mode A)

- PPRA opinion
- Auditor role
- Bank-matched claim
- Full commission engine
- SARS
- Second ledger
- Live remittance / partner settlement HTTP

## Where to look

- Lib: `src/lib/rentRoll/`
- UI: `src/components/rentRoll/` (banner + panel)
- Mounted on: Owner Portal, Landlords Directory (beside owner statement)
