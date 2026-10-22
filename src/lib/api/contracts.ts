/**
 * Shared API UX contracts for Lekaya Asset OS.
 * Every list/detail payload should be card-ready: actions, display_metadata, nested context.
 */

import type { Permission, Role } from '../../types/domain'

/** Predictive HATEOAS — frontends render buttons from this block, not hard-coded stage maps. */
export type HateoasAction = {
  /** Stable machine key, e.g. APPROVE_CREDIT, DECLINE_INCOME */
  key: string
  /** Button / menu label */
  label: string
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  /** Relative API path the client may call */
  href: string
  /** Soft confirmation copy when destructive */
  confirm?: string
  /** Required permission codes; empty = any authenticated tenant member */
  requires: Permission[]
  /** Visual hint for UI chrome */
  tone?: 'primary' | 'secondary' | 'danger' | 'ghost'
  /** Optional payload schema hints for the client */
  payload_hint?: Record<string, string>
}

export type DisplayMetadata = {
  /** e.g. "Updated 2 mins ago" */
  updated_relative: string
  /** e.g. "Scheduled for Tuesday at 14:00" */
  scheduled_relative?: string | null
  /** e.g. "Submitted 12 Jul 2026" */
  created_relative?: string | null
  /** Short status line for cards */
  status_label: string
  /** Currency / count lines preformatted for SA locale */
  primary_amount_label?: string | null
  secondary_amount_label?: string | null
  timezone: string
}

export type BuildingStructuralContext = {
  id: string
  name: string
  suburb: string
  city: string
  province: string
  grading: 'P' | 'A' | 'B' | 'C' | null
  solar_capacity_kw: number
  has_borehole: boolean
  /** Derived: solar ≥ 3 kW or Generator amenity → grid-resilient badge */
  is_load_shedding_free: boolean
  /** Premium when Grade P or solar ≥ 20 kW + borehole */
  is_premium_tier: boolean
  lat: number
  lng: number
}

export type CursorPageMeta = {
  next_cursor: string | null
  prev_cursor: string | null
  has_more: boolean
  limit: number
  /** Approximate total when cheap to compute; null when skipped for speed */
  total_estimate: number | null
}

export type ApiEnvelope<T> = {
  data: T
  display_metadata?: DisplayMetadata
  actions?: HateoasAction[]
  meta?: Record<string, unknown>
}

export type CursorFeedResponse<T> = {
  data: T[]
  pagination: CursorPageMeta
  meta?: Record<string, unknown>
}

export type ActorContext = {
  userId: string
  role: Role
  agencyId: string | null
  permissions: Permission[]
}

export function actorCan(actor: ActorContext, permission: Permission): boolean {
  return actor.permissions.includes(permission)
}

export function filterActionsForActor(
  actions: HateoasAction[],
  actor: ActorContext,
): HateoasAction[] {
  return actions.filter(
    (a) => a.requires.length === 0 || a.requires.some((p) => actorCan(actor, p)),
  )
}
