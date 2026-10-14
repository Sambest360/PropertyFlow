# Letkaya 14 Oct full PDF — FW-01–FW-30 verification

**Log:** `Letkaya-Test-Log-14Oct-full.pdf` (runs 1–5, live site was `c1967a04`).  
**Code baseline:** `main` through routing/navigation closure (post-`21d8b17`).  
**Re-run:** Deploy latest `main` (apply `database/postgres/migrations/014_unit_property_type.sql`), then hand-check rows marked *manual*. Run 5 failures on `property-flow-jet` expected until this bundle ships.

| ID | Status | Evidence |
|----|--------|----------|
| FW-01 | Code fixed | `index.css` story media vertical slide on mobile + `#home-story` overflow-x-clip — *manual* 390px `/` |
| FW-02, FW-26, FW-21, FW-28, FW-30 | Code fixed | P04 hydrate + lite→full + `canApplyBootstrapHydration` (AUTH_KEY lag); FW-28 soft-miss; P09b Try again — *manual* cold `/workspace`, applications, **maintenance** |
| FW-03, FW-04, FW-20 | Code fixed | `publicMarketplaceMerge` + tests — *manual* signed-in `/browse` |
| FW-05, FW-27 | Code fixed | Sync first-visit opt-out in `PageTipsPreferenceDialog` (no modal; deploy post-`61e1248` + FW-05) |
| FW-06 | Code fixed | Register session hold + `postRegisterPath` owner portal — *manual* landlord signup |
| FW-07 | Code fixed | `apiMe` retry, no logout on abort — *manual* typed portal URL |
| FW-08, FW-22, FW-23 | Code fixed | `scopeWrite` landlord building create; `scopeWrite.test.ts` L03 case |
| FW-09 | Code fixed | `sessionProbeCoord` stale `/api/auth/me` after change-password — *manual* agadmin temp password |
| FW-10 | Code fixed | `PropertyCreatePage` single submit + busy guard |
| FW-11 | Code fixed | `units.property_type` + `resolvePropertyType` — **run migration `014_unit_property_type.sql` on deploy** |
| FW-12 | Code fixed | `mustChangePassword` on Supabase session — *manual* staff temp password |
| FW-16 S06 | Code fixed | `propertiesPortfolioSearch` — URL `q` on `/workspace/properties` — *manual* global search Walmer |
| FW-13 S03 | Code fixed | SA bootstrap cooldown + `sessionRole` from `boot.actor`; Billing nav — *manual* SA |
| FW-15 S05, FW-17 S08 | Code fixed | `complianceQueue` + `emptyBootstrapAuth` staff roster; agency FE scope |
| FW-14 S04 (I11,I16) | Code fixed | Bootstrap `loadIdMapCache(true)`, `enrichActor` agency FE normalize, agencies/users bootstrap merge — *manual* create agency + reload |
| FW-18 | Code fixed | `viewingSlotTime` + listing/viewing pages; unit tests |
| FW-19 | Code fixed | Bootstrap refresh after user/agency persist — *manual* A07 |
| FW-24 | Code fixed | Landlord Applications nav → `/workspace/applications`; `portal.owner` before sales path |
| FW-25 | Code fixed | `/workspace/leases` redirect; `WorkspaceAwareNotFound` (no public `/` fall-through) |
| FW-29 | Code fixed | Tenant portal `leases`/`payments` routes + `WorkspacePaymentsRedirect` |

**Automated:** `npm test` (1513+ passed), `npm run build`.

**HQ (PDF header):** HTML escape + log redaction + prod actor headers — `61e1248`.
