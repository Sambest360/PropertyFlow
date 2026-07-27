# PropertyFlow

Multi-tenant **Property Management & Sales** platform (Vite SPA + local Hono API + Postgres).

## Empty-start happy path

1. Reset to an empty database (schema only — no Amelia/Horizon/PE demo rows):

```bash
npm run db:reset
```

2. Start the app:

```bash
npm install
npm run dev          # API :8787 + Vite :5173
```

3. Open **http://127.0.0.1:5173/register** — the first account becomes **Super Admin**.
4. Create an agency → add staff / landlord / tenant / contractor (temp password shown in notifications).
5. Create & publish properties.
6. Applicant self-registers on the marketplace, signs in, and **Apply** on a listing.
7. Refresh — data comes from Postgres (`propertyflow-v17` localStorage is only a degraded fallback).

### Optional demo seed

```bash
npm run db:reset:demo   # schema + seed.sql + PE bulk listings
# or
npm run db:seed:demo
```

Set `VITE_DEMO_SWITCHER=1` if you still want the header persona switcher (off by default).

## Run

```bash
cd ~/Projects/propertyflow
npm install
npm run dev
```

Separate processes: `npm run dev:api` / `npm run dev:vite`.

## Auth

| Endpoint | Purpose |
| --- | --- |
| `POST /api/auth/register` | Public register (first user → `super_admin`) |
| `POST /api/auth/login` | Email + password → JWT (Bearer + httpOnly cookie) |
| `POST /api/auth/logout` | Clear session |
| `GET /api/auth/me` | Current user |
| `GET /api/auth/bootstrap-needed` | `needed: true` when `users` is empty |

Workspace routes require a session (`RequireAuth`). Marketplace browse is public; **Apply** requires login/register.

Actor headers (`X-User-Id` / `X-Role` / `X-Agency-Id`) still gate writes; the session token also resolves the actor when headers are absent.

## Data

- Postgres is the source of truth via `GET /api/bootstrap` + `POST /api/persist`.
- Default seed is empty (`database/postgres/seed_empty.sql`).
- localStorage key: `propertyflow-v17`.
- Env: copy `.env.example` → `.env.local` (`DATABASE_URL`, `AUTH_SECRET`, optional `VITE_GOOGLE_MAPS_API_KEY`).

## People & permissions

| Role | Team | Tenants | Users | Notes |
| --- | --- | --- | --- | --- |
| Super Admin | — | — | Platform | Create agencies |
| Principal (`client_admin`) | Yes | Yes | Yes | Agency owner |
| Agency admin (`agent_admin`) | Yes (+ add) | No | No | Team only |
| Field agents | No | If `occupants.view` | No | Property-scoped |
| Landlord / Tenant / Contractor | Portals | — | — | Property-linked |

## Property-linked access

Enforced in UI (`src/lib/scope.ts`) and API (`server/scopeGate.ts`). Writes without actor/session → **401**; out-of-book → **403**.

## Tests

```bash
npm test
```
