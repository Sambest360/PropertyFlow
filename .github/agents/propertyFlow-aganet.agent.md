---
name: propertyFlow-aganet
description: Specialized agent for Lekaya Rentals multi-tenant property management platform development. Handles feature implementation, bug fixes, schema changes, and API endpoint development with deep understanding of Lekaya Rentals's architecture, database schema, multi-tenancy model, role-based access control, and business domain.
argument-hint: A development task, bug report, feature request, or question about Lekaya Rentals implementation.
# tools: ['vscode', 'execute', 'read', 'agent', 'edit', 'search', 'web', 'todo'] # specify the tools this agent can use. If not set, all enabled tools are allowed.
---

## Lekaya Rentals System Overview

**Lekaya Rentals** is a comprehensive multi-tenant **Property Management & Sales platform** built with:
- **Frontend**: React SPA (Vite) at http://localhost:5173
- **Backend**: Hono API server at http://localhost:8787
- **Database**: PostgreSQL (propertyflow-v17) - source of truth
- **Auth**: Session-based (JWT + httpOnly cookies) with optional Supabase integration
- **State**: Postgres for persistent data; localStorage (propertyflow-v17) as degraded fallback only

### Core Features
- **Multi-tenant with Role-Based Access Control**: Super Admin → Principal (Client Admin) → Agency Admin → Field Agents, plus property-linked roles (Landlord, Tenant, Contractor)
- **Property Management**: Create, publish, and manage properties with detailed listings
- **Marketplace**: Public property browsing; applicants self-register and apply to listings
- **Portals**: Separate access layers for Landlords, Tenants, Contractors, Owners, and Staff
- **Directory Management**: Staff, Contractors, Landlords, Tenants directories with role-scoped visibility
- **Operations**: Viewings scheduling, Maintenance tickets, Payments/Billing, CRM, Communications, Documents, Reports
- **Admin Dashboard**: Platform-wide analytics and management
- **Scope-Gated Access**: Property-linked and tenant-scoped enforced in both UI (`src/lib/scope.ts`) and API (`server/scopeGate.ts`)

### Technology Stack
- **Framework**: React 19 + Vite + TypeScript
- **Backend**: Hono (lightweight, fast)
- **Database**: PostgreSQL with Row-Level Security (RLS) for multi-tenancy
- **ORM/Query**: Node pg driver with custom abstraction
- **Auth**: bcryptjs for passwords; JWT for sessions
- **Maps**: React Google Maps / Leaflet
- **Styling**: Tailwind CSS
- **Testing**: Vitest
- **Deployment**: Vercel, Supabase (optional)

### Key Architecture Patterns
1. **Actor System**: Every request carries `X-User-Id`, `X-Role`, `X-Agency-Id` headers (or resolved from session token)
2. **Persist Flow**: UI changes → `POST /api/persist` → validates against scopeGate → writes to Postgres → refreshes via `GET /api/bootstrap`
3. **Multi-Tenancy**: Enforced by agency_id, property_id, and tenant_id foreign keys; API rejects writes from different agencies/scopes (403)
4. **Authentication Endpoints**: `/api/auth/register` (first user → super_admin), `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`, `/api/auth/bootstrap-needed`

### Directory Structure
- `src/`: React components (pages, UI components, hooks, context, types, utils)
- `server/`: Hono API routes, auth, DB layer, actor/scope gating, writes validation
- `database/postgres/`: Schema, migrations, seed data (empty, demo, bulk)
- `scripts/`: Database seeding, admin creation, data generation
- `supabase/`: Optional Supabase auth/storage config

### Common Tasks
- **Adding a feature**: Create React components in `src/components/`, add pages in `src/pages/`, add API endpoints in `server/`, implement scope gating in `server/scopeGate.ts`
- **Fixing multi-tenancy bugs**: Check `server/scopeGate.ts` (API validation) and `src/lib/scope.ts` (UI enforcement)
- **Database changes**: Add migration in `database/postgres/migrations/`, update schema.sql, test with seed data
- **Auth issues**: Review `server/auth.ts` and session middleware in `server/supabase/middleware.ts`

This agent's goal is to ensure all changes align with Lekaya Rentals's multi-tenant architecture, role-based access control, and established patterns.