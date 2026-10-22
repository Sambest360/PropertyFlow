# PCR / inspections — Mode A (Jim + Oscar soft stamp)

Lekaya’s PCR path is a **joint-style soft condition pack beside occupancy**:
incoming/outgoing inspection object, lite room/item template, photos/notes, staff+tenant
soft ack (or documented no-show + admin override), and a downloadable PDF pack. That path
must **never** be claimed as RHA-certified statutory PCR, PropertyInspect / RedRabbit
parity, a full offline field app, or GPS-required capture.

## What Mode A ships

| Surface | Behaviour |
| --- | --- |
| Inspection object | Incoming + outgoing on the application (`pcrInspections`) |
| Lite template | Default SA residential rooms/items (not a full field catalogue) |
| Photos / notes | Per-item notes, condition, optional photo data URLs |
| Soft sign / ack | Staff + tenant in-app ack **or** documented no-show + admin override → `ingoingPcrSigned` |
| Soft gate | `KEYS_READY` / `COMPLETE_KEY_HANDOVER` / `ACTIVATE_TENANCY` blocked until incoming signed or audited override |
| PCR PDF pack | Downloadable branded PDF (pdf-lib) with honesty footer |
| Deposit theater | Soft-warn damage / refund talk without outgoing path — **not** hard auto-forfeit |
| Maintenance hook | Optional draft ticket shapes from damaged / flagged items |
| Partner adapter | `ManualPcrAdapter` + `RefuseClosedPcrPartnerAdapter` (PropertyInspect / RedRabbit) |
| Honesty banner | Mode A copy on occupancy / inspection lifecycle stages |

## Safe claims

- **OK:** “Joint-style soft PCR pack beside occupancy — not a full field PCR product.”
- **OK:** “Soft-gate keys/move-in on incoming soft-sign or audited override.”
- **Not OK:** “RHA certified” / statutory PCR legal product.
- **Not OK:** “Live PropertyInspect / RedRabbit” or field-app parity.
- **Not OK:** Hard auto-forfeit deposit; GPS-required claim.

## OUT (Mode A)

- Offline native field app
- Live PropertyInspect / RedRabbit HTTP
- Invent “RHA certified” / statutory PCR product claim
- Hard auto-forfeit deposit
- GPS-required claim

## Where to look

- Lib: `src/lib/pcr/`
- UI: `src/components/pcr/` (banner + inspection panel)
- Workflow gates: `KEYS_READY` / `COMPLETE_KEY_HANDOVER` / `ACTIVATE_TENANCY` in `applicationWorkflow.ts`
