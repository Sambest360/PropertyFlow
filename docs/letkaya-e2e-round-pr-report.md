# Lekaya E2E round — PR report (section 5)

**Branch:** `fix/letkaya-e2e-round`  
**Base:** `main`  
**Label:** `security` (auth, persist gate, email redaction)

## Build gate

- `npm run build` — pass  
- `npm run lint` — pass (existing warnings only)  
- `npm test` — **1608** passed, 8 skipped  

**Deploy:** apply additive migration `database/postgres/migrations/014_unit_property_type.sql` on Neon when promoting preview.

## Issues 1–16 (summary)

| Issue | Status | Notes |
|-------|--------|-------|
| 1 Bootstrap / skeleton | Partial | Server-Timing + slow lite log on `/api/bootstrap`; client hydration gates on tenant dashboard. Full &lt;1.5s lite still needs DB profiling on preview. |
| 1b Session drop | Partial | Marketplace header defers guest chrome when JWT present; existing auth timeout fixes on `main`. |
| 1c False empty | Partial | Wishlist loader + tenant dashboard `…` while hydrate pending; tests added. |
| 2 Marketplace feed | Partial | Guest publish test; merge keeps E2E public row when scoped boot empty; publish sets unit `statusKey` in `publishProperty`. Manual P05 on preview. |
| 3 localStorage flicker | Fixed | Marketplace keys in `LIVE_MODE_UNPERSISTED_KEYS` + tests. |
| 4 Landlord persist | Partial | Scope on `main`; wizard photos unblocked (issue 16). Re-test L03 403 on preview. |
| 5–6 Routes / tenant nav | Partial | Landlord apps nav + tenant portal links on `portal.tenant`; workspace 404 on `main`. T-chain manual after deploy. |
| 7 ID map / team | Partial | `reconcileAgencyIdSpace` now remaps **property** `agencyId` UUID→`ag-*` (A02/csirjj). |
| 8 V01 viewings | Fixed on `main` | `viewingSlotTime` + server tests — regression only on preview. |
| 9 G04 areas | Fixed | `areas=` on browse + exact suburb match. |
| 10 Double POST | Partial | Admin agency create submit lock; property wizard guarded. |
| 11 P13 tips | Fixed | Toggle label Show / Turn off. |
| 12 G05 map/images | Partial | Leaflet Carto tiles documented; card placeholders via `PropertyCard` / `NO_PHOTOS_YET`. No CSP change (Vite SPA). |
| 13 G07 overflow | Partial | Layout regression tests (`marketHomeLayout.test.ts`). |
| 14 Security | Partial | `writeGate` on `persistUpsert` + trust deposits; `actorAuth` PROD test; `redactEmailForLog` test. Bearer→cookie and removing stored-auth fallbacks **not done**. |
| 15 Agency list empty | Partial | Property agency id reconcile (above); manual csirjj on preview. |
| 16 Wizard photos | Fixed | Removed `omitFromPersist` for `buildingImages`. |

## Security evidence

- `src/lib/auth/writeGate.test.ts`, `src/lib/api/trustDepositsApi.gate.test.ts`
- `src/lib/api/actorAuth.test.ts`
- `server/leaseSignedEmail.test.ts` (`redactEmailForLog`, `escapeHtml`)

## Section 4 checklist

Run on **Vercel preview URL** after push (manual; SA S01–S08 automated where noted).

| IDs | Preview |
|-----|---------|
| G01–G03 | Pending manual |
| G04 | PASS (automated tests) |
| G07 | Pending 390px device emulation |
| P01–P04, P09 | Pending manual (&lt;8s) |
| P05–P08, L03–L08, A01–A07, T01–T04 | Pending manual after deploy |

## Follow-ups

- Lite bootstrap &lt;1.5s (indexes / query split).  
- Remove `readStoredAuthUserId` fallbacks only with full cold-load test matrix.  
- Bearer token → cookie-only session.

**Do not merge** until preview checklist and security review complete.
