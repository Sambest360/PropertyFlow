-- 043: Administrators, the platform tier below a super admin.
-- An Administrator keeps the super admin role but has
-- users.metadata.platform_tier = 'administrator' (src/lib/platformTier.ts).
--
-- Runs once (marker in platform_settings): every platform admin except the two
-- owner accounts becomes an Administrator, and those two stay full super
-- admins. Later changes are made in the app, and a re-run changes nothing.

CREATE TABLE IF NOT EXISTS platform_settings (
  key         VARCHAR(80) PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  UUID REFERENCES users(id) ON DELETE SET NULL
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM platform_settings WHERE key = 'migration_043_platform_administrators') THEN
    RETURN;
  END IF;

  UPDATE users
     SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"platform_tier":"administrator"}'::jsonb,
         updated_at = NOW()
   WHERE (role = 'SUPER_ADMIN' OR metadata->>'frontend_role' = 'super_admin')
     AND LOWER(email) NOT IN ('sambampo200@gmail.com', 'samuel@lekayarentals.site');

  UPDATE users
     SET metadata = COALESCE(metadata, '{}'::jsonb) - 'platform_tier',
         updated_at = NOW()
   WHERE LOWER(email) IN ('sambampo200@gmail.com', 'samuel@lekayarentals.site');

  INSERT INTO platform_settings (key, value)
  VALUES ('migration_043_platform_administrators', jsonb_build_object('ranAt', NOW()));
END $$;
