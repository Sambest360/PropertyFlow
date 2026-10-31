-- T2 (hardening spec r4, sha256 f1269aa1…): erf / stand size of the land, separate from the
-- floor size (units.square_meters). Both optional; never summed or merged.
-- Spec r4 calls this "migration 035"; 035 and 036 already exist on main, so it is 037.
-- Blank (NULL) for sectional-title units, which have no erf of their own.
-- Add-only, safe to run again (IF NOT EXISTS skips the column and its check).
-- Live is the self-hosted Postgres; apply BEFORE the T2 code deploys.
ALTER TABLE units
  ADD COLUMN IF NOT EXISTS erf_size_sqm NUMERIC(12,2) NULL
    CONSTRAINT units_erf_size_sqm_nonneg CHECK (erf_size_sqm IS NULL OR erf_size_sqm >= 0);
