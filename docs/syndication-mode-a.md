# Portal syndication — Mode A (Oscar gap §3 / Jim soft stamp)

PropertyFlow’s syndication path is **own-site marketplace + manual portal packs +
lead CSV into CRM**. That path must **never** be claimed as live Property24 /
Private Property push or portal parity.

## What Mode A ships

| Surface | Behaviour |
| --- | --- |
| Canonical listing | Projection from property + completeness score (pack readiness) |
| Manual export pack | Property24 / Private Property CSV+JSON download; status `exported_manual` |
| Mark live | Staff marks `live_manual` after pasting on the portal |
| Lead CSV → CRM | `source` + `external_id` dedupe (and email/phone+listing within 7 days) |
| Partner adapter | `IListingPortalAdapter` / `RefuseClosedPartnerAdapter` hard-refuses live push |
| Honesty banner | Mode A copy on Portals tab + CRM lead CSV |
| Mandate | Soft-warn when not marked active — **not** a hard gate in Mode A |

## Safe claims

- **OK:** “Export pack + lead CSV into CRM beside own marketplace — not live syndication.”
- **OK:** “Own-site / manual pack — not live P24.”
- **Not OK:** “Live Property24 / Private Property feed.”
- **Not OK:** Claiming portal parity or inventing partner keys / scrape paths.

## OUT (Mode A)

- Live P24/PP HTTP
- Scrape / unofficial Parse API / headless portal login
- Inventing partner REST paths or credentials
- Featured auto-pay on portals
- Claiming portal parity
- Full mandate hard-enforcement (that is compliance §2 — Mode A only soft-warns)

## Where to look

- Lib: `src/lib/syndication/`
- Property UI: Portals tab → `PropertySyndicationPanel`
- CRM: `LeadCsvImportPanel`
