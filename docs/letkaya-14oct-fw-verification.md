# Letkaya 14 Oct full PDF — FW-01–FW-30 verification

**Log:** `Letkaya-Test-Log-14Oct-full.pdf` (runs 1–5, live site was `c1967a04`).  
**Code baseline:** `main` through routing/navigation closure (post-`21d8b17`).  
**Re-run:** Deploy latest `main`, then hand-check rows marked *manual*.

| ID | Status | Evidence |
|----|--------|----------|
| FW-01 | Code fixed | `MarketHome` / `AppShell` overflow-x-hidden — *manual* 390px `/` |
| FW-02, FW-26, FW-21, FW-28, FW-30 | Code fixed | 20s lite bootstrap, `PortalHydrationGate`, marketplace merge — *manual* cold `/workspace` |
| FW-03, FW-04, FW-20 | Code fixed | `publicMarketplaceMerge` + tests — *manual* signed-in `/browse` |
| FW-05, FW-27 | Code fixed | `PageTipsPreferenceDialog` silent default |
| FW-06 | Manual only | L01 registration (run 3) |
| FW-07 | Code fixed | `apiMe` retry, no logout on abort — *manual* typed portal URL |
| FW-08, FW-22, FW-23 | Code fixed | `scopeWrite` landlord building create; `scopeWrite.test.ts` L03 case |
| FW-09 | Out of scope | A01 password-change flake |
| FW-10 | Code fixed | `PropertyCreatePage` single submit + busy guard |
| FW-11 | Manual verify | Wizard default `Apartment`; confirm House persists on save |
| FW-12 | Manual verify | Temp password gate (`RequireAuth`) |
| FW-13–FW-17 | Partial / blocked | SA path not run in PDF runs 4–5; id-map invalidation on writes |
| FW-18 | Code fixed | `viewingSlotTime` + listing/viewing pages; unit tests |
| FW-19 | Code fixed | Bootstrap refresh after user/agency persist — *manual* A07 |
| FW-24 | Code fixed | `WorkspaceApplicationsRedirect` + landlord nav “Applications” |
| FW-25 | Code fixed | `WorkspaceLeasesRedirect` + workspace `*` → `/workspace` |
| FW-29 | Code fixed | Routes + `TenantPortal` leases/payments views |
| FW-28 | Code fixed | Tenant nav “My lease” / “Payments” when occupancy ready |

**Automated:** `npm test` (1513+ passed), `npm run build`.

**HQ (PDF header):** HTML escape + log redaction + prod actor headers — `61e1248`.
