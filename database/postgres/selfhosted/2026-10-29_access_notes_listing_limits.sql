-- Self-hosted Postgres (no Supabase): the two pieces the API uses that
-- migrations 013 and 024/027 could not create there. Add-only and safe to run
-- again: one new nullable column and one read-only function. No data changes.
--
-- Run with scripts/db-apply-selfhosted.cjs (dry run by default).

-- 013: maintenance ticket access notes (gate codes, pets, best time to attend).
ALTER TABLE maintenance_tickets ADD COLUMN IF NOT EXISTS access_notes text;

-- 024/027: per-listing enquiry/viewing caps behind the "fully booked" and
-- "X viewings left" badges. Same counting as migration 027, without its
-- Supabase role guard (is_super_admin(), current_app_*(), anon/authenticated),
-- which needs functions and roles a self-hosted database does not have. Here
-- only the API's own database connection calls it (server/bootstrap.ts), and
-- the guest marketplace output is filtered server-side (guestMarketplace.ts).
CREATE OR REPLACE FUNCTION unit_listing_limit_snapshot(p_unit_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  -- A missing unit is '{}' (never NULL), as in 027.
  SELECT coalesce((
    WITH u AS (
      SELECT
        units.id,
        units.listing_type,
        units.limit_action,
        units.show_remaining,
        units.limits_round_started_at,
        CASE
          WHEN upper(coalesce(units.listing_type, '')) IN ('RENT', 'BOTH') THEN
            COALESCE(units.max_enquiries, NULLIF(c.settings #>> '{listingLimits,maxEnquiries}', '')::int)
          ELSE NULL
        END AS eff_enquiries,
        CASE
          WHEN upper(coalesce(units.listing_type, '')) IN ('RENT', 'BOTH') THEN
            COALESCE(units.max_viewings, NULLIF(c.settings #>> '{listingLimits,maxViewings}', '')::int)
          ELSE NULL
        END AS eff_viewings
      FROM units
      JOIN clients c ON c.id = units.client_id
      WHERE units.id = p_unit_id
    ),
    counts AS (
      SELECT
        (SELECT COUNT(*)::int FROM leads l
          WHERE l.unit_id = u.id
            AND COALESCE(l.is_waitlisted, false) = false
            AND COALESCE(l.metadata->>'limit_bucket', '') <> 'viewing'
            AND COALESCE(l.metadata->>'spam', '') <> 'true'
            AND (u.limits_round_started_at IS NULL OR l.created_at >= u.limits_round_started_at)
        ) AS enquiries,
        (SELECT COUNT(*)::int FROM bookings b
          WHERE b.unit_id = u.id
            AND b.status IN ('SCHEDULED', 'COMPLETED', 'NO_SHOW')
            AND (u.limits_round_started_at IS NULL OR b.created_at >= u.limits_round_started_at)
        ) AS viewings
      FROM u
    )
    SELECT jsonb_build_object(
      'fully_booked',
        (u.eff_enquiries IS NOT NULL AND counts.enquiries >= u.eff_enquiries)
        OR (u.eff_viewings IS NOT NULL AND counts.viewings >= u.eff_viewings),
      'enquiries_full', u.eff_enquiries IS NOT NULL AND counts.enquiries >= u.eff_enquiries,
      'viewings_full', u.eff_viewings IS NOT NULL AND counts.viewings >= u.eff_viewings,
      'limit_action', u.limit_action,
      'show_remaining', u.show_remaining,
      'enquiry_count', counts.enquiries,
      'viewing_count', counts.viewings,
      'max_enquiries', u.eff_enquiries,
      'max_viewings', u.eff_viewings,
      'remaining', CASE
        WHEN COALESCE(u.show_remaining, false) THEN jsonb_build_object(
          'enquiries', CASE WHEN u.eff_enquiries IS NULL THEN NULL ELSE GREATEST(u.eff_enquiries - counts.enquiries, 0) END,
          'viewings', CASE WHEN u.eff_viewings IS NULL THEN NULL ELSE GREATEST(u.eff_viewings - counts.viewings, 0) END
        )
        ELSE NULL
      END
    )
    FROM u, counts
  ), '{}'::jsonb)
$$;
