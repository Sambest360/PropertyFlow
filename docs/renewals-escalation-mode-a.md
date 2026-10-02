# Renewals + rent escalation — Mode A (Michael GO + Jim stamp / Oscar aligned)

PropertyFlow’s year-ops renewal path ships a **soft CPA-style notice clock**,
**offer / accept / decline** beside leases (#15), and **scheduled book escalation**
(`escalationPct` / `nextEscalationOn`). That path must **never** be claimed as a
statutory CPA legal product, live notice delivery (WhatsApp/SMS/email CPA), live CPI
HTTP, or auto-sign of a new fixed term.

## What Mode A ships

| Surface | Behaviour |
| --- | --- |
| Soft CPA notice clock | `cpa_notice_window_open/close` ≈ 80–40 biz days before `lease_end` |
| In-app `cpa_expiry_notice` | Sendable when window open (or late catch-up) — in-app only |
| `cpa_notice_late` | Flag only: **"late; seek counsel"** — no invented legal consequences |
| Offer / accept / decline | Beside People → Leases (#15); beyond stage-only OFFER/ACCEPT/DECLINE_RENEWAL |
| Accept | Extends **term + rent on book**; workflow → `renewed` |
| Decline | → `notice_given` on book; no invented early-cancel penalty % |
| No election | Month-to-month **note** after lease_end — does **not** auto-sign a new 12-mo |
| Scheduled escalation | Persist + apply staff-set `%` / `nextEscalationOn` (wires dead BillingSchedule fields) |
| Honesty banner | Mode A copy on Leases + tenant lease panel |
| Reuse | Recurring rent / dunning #18/#28 patterns — not rebuilt |

## Safe claims

- **OK:** “Soft year-ops renewal clock + escalate/renew/decline + scheduled book increase — in-app only.”
- **OK:** “Not CPA legal service / not live notice / not live CPI.”
- **Not OK:** Invented statutory CPA product.
- **Not OK:** Live WhatsApp/SMS/email CPA delivery.
- **Not OK:** Invented CPI HTTP success.
- **Not OK:** Auto-sign new fixed term.

## OUT (Mode A)

- Invent statutory CPA product
- Live WhatsApp/SMS/email CPA delivery
- Invent CPI HTTP success
- Auto-sign new fixed term
- Invent early-cancel penalty %
- Conveyancing/Deeds
- Re-dig messaging / DQ-M3 / syndication / PCR / rent-roll
- Commission / SARS / PPRA

## Where to look

- Lib: `src/lib/renewals/`
- UI: `src/components/renewals/` + mounts on People → Leases / tenant lease panel
- Workflow: `OFFER_RENEWAL` / `ACCEPT_RENEWAL` / `DECLINE_RENEWAL` in `applicationWorkflow.ts` (now book-backed)
- Persist: `leases.metadata.renewalOps` + `leases.metadata.billingSchedule`
