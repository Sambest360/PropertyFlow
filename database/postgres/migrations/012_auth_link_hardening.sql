-- 012: stop auth-email re-link account takeover.
--
-- Reproduced on local Postgres with migrations 002 + 004 + 009 applied:
-- public.sync_auth_user_profile() inserted into public.users with
--   ON CONFLICT (email) DO UPDATE SET auth_user_id = EXCLUDED.auth_user_id
-- A second auth.users row whose email lowercased to an existing profile
-- (Victim@example.com vs victim@example.com — GoTrue's unique index on
-- auth.users.email is case-sensitive) rewrote that profile's auth_user_id,
-- name, and password hash and kept the victim's role and agency. The same
-- upsert steals a pre-provisioned profile when the new auth row uses the
-- exact email. email_confirmed_at was not checked. The same function also
-- promotes the first public.users row to SUPER_ADMIN.
--
-- After this migration:
--   * Email match alone never changes an existing profile's auth_user_id.
--   * An existing or pre-provisioned profile is linked only when
--     auth.users.email_confirmed_at IS NOT NULL and a pending invite is bound
--     to that auth user id, or to a token that user redeemed, and the invite
--     was created by active staff of that agency (AGENCY_ADMIN, AGENT_ADMIN,
--     GROUND_AGENT whose client_id is the invite's agency_id).
--   * Otherwise a new auth user gets a fresh END_USER profile with no agency,
--     or no profile at all when that email already belongs to someone else.
--   * An invite is consumed once. SUPER_ADMIN is never granted here, including
--     for the first user on an empty public.users table.
--
-- POST /invite {email, role, agency_id} writes public.invites and returns
-- {user_id}, which is the GoTrue auth user id, not a public.users id.
-- The insert is unchanged from the Hono API:
--
--   INSERT INTO invites (
--     email, role, agency_id, auth_user_id, token, invited_by, status
--   ) VALUES ($1, $2, $3::uuid, $4::uuid, $5, $6::uuid, 'pending');
--
-- Columns (same shape as that API):
--   id            uuid PK default gen_random_uuid()
--   email         varchar(190) NOT NULL  -- stored lower(trim(email))
--   role          varchar(40) NOT NULL   -- frontend role; super_admin is never applied
--   agency_id     uuid NOT NULL          -- clients.id
--   auth_user_id  uuid NULL              -- GoTrue user id. No FK to auth.users.
--   token         text NULL UNIQUE       -- alternate redeem key
--   invited_by    uuid NOT NULL          -- public.users.id of the creator
--   status        varchar(20) NOT NULL default 'pending'
--                 -- pending, consumed, or revoked
--   created_at    timestamptz NOT NULL default now()
--   consumed_at   timestamptz NULL
--
-- A pending row must have auth_user_id or token. At most one pending invite
-- exists per lower(email) and agency_id. Consume once:
-- status = 'consumed', consumed_at = now(), and auth_user_id is set to the
-- auth user who consumed it.
--
-- Link only when email_confirmed_at is not null, the confirmed auth email
-- equals invites.email, and a pending invite matches that auth user id or a
-- token that user redeemed. The creator (invited_by) must be active staff of
-- that agency. Email match alone never re-links a profile.
--
-- RLS is on. anon and authenticated have no table privileges. propertyflow_api
-- (created here if missing) and service_role may write invites.
--
-- Safe to run more than once on this shape. It does not rewrite an invites
-- table that still has the earlier draft column created_by.

BEGIN;

DO $shape$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'invites'
      AND column_name = 'created_by'
  ) THEN
    RAISE EXCEPTION
      'public.invites still has the draft created_by column. Drop that table and re-run 012; this migration does not rewrite it.';
  END IF;
END
$shape$;

CREATE TABLE IF NOT EXISTS public.invites (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(190) NOT NULL,
  role          VARCHAR(40) NOT NULL,
  agency_id     UUID NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  auth_user_id  UUID,
  token         TEXT UNIQUE,
  invited_by    UUID NOT NULL REFERENCES public.users (id) ON DELETE RESTRICT,
  status        VARCHAR(20) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'consumed', 'revoked')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consumed_at   TIMESTAMPTZ,
  CONSTRAINT invites_pending_has_identity CHECK (
    status <> 'pending' OR auth_user_id IS NOT NULL OR token IS NOT NULL
  ),
  CONSTRAINT invites_email_normalized CHECK (email = lower(trim(email)) AND length(email) > 0),
  CONSTRAINT invites_role_nonempty CHECK (length(trim(role)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS invites_one_pending_email_agency
  ON public.invites (lower(email), agency_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS invites_pending_auth_user
  ON public.invites (auth_user_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS invites_agency_id_idx ON public.invites (agency_id);
CREATE INDEX IF NOT EXISTS invites_invited_by_idx ON public.invites (invited_by);

COMMENT ON TABLE public.invites IS
  'Pending staff invites consumed by sync_auth_user_profile. Written by POST /invite {email, role, agency_id}. auth_user_id is a GoTrue id and has no foreign key.';

CREATE OR REPLACE FUNCTION public.normalize_invite_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.email := lower(trim(NEW.email));
  NEW.role := trim(NEW.role);
  IF NEW.token IS NOT NULL THEN
    NEW.token := NULLIF(trim(NEW.token), '');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invites_normalize_email ON public.invites;
CREATE TRIGGER invites_normalize_email
  BEFORE INSERT OR UPDATE OF email, role, token ON public.invites
  FOR EACH ROW EXECUTE FUNCTION public.normalize_invite_email();

CREATE OR REPLACE FUNCTION public.sync_auth_user_profile(p_auth_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  au              RECORD;
  v_meta          JSONB;
  v_email         TEXT;
  v_token         TEXT;
  v_confirmed     BOOLEAN;
  v_invite_id     UUID;
  v_inv           public.invites%ROWTYPE;
  v_db_role       TEXT;
  v_fe_role       TEXT;
  v_target_id     UUID;
  v_target_auth   UUID;
  v_target_role   TEXT;
  v_target_email  TEXT;
  v_mine          UUID;
  v_linked_id     UUID;
  v_first         TEXT;
  v_last          TEXT;
  v_phone         TEXT;
  v_hash          TEXT;
  v_fe_id         TEXT;
  v_user_meta     JSONB;
  v_consumed      UUID;
BEGIN
  IF p_auth_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Direct RPC calls may only sync the signed-in user. Trigger and server
  -- calls (auth.uid() is null, or we are inside the auth/invite trigger) may
  -- sync the row that was just written.
  IF pg_trigger_depth() = 0
     AND auth.uid() IS NOT NULL
     AND auth.uid() IS DISTINCT FROM p_auth_user_id THEN
    RETURN NULL;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_auth_user_id::text, 0));

  SELECT * INTO au FROM auth.users WHERE id = p_auth_user_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_meta := COALESCE(au.raw_user_meta_data, '{}'::jsonb);
  v_email := NULLIF(lower(trim(au.email)), '');
  v_token := NULLIF(trim(v_meta->>'invite_token'), '');
  v_confirmed := au.email_confirmed_at IS NOT NULL;
  v_hash := NULLIF(to_jsonb(au)->>'encrypted_password', '');

  IF v_email IS NOT NULL THEN
    SELECT i.id
      INTO v_invite_id
    FROM public.invites i
    JOIN public.users creator ON creator.id = i.invited_by
    WHERE i.status = 'pending'
      AND i.email = v_email
      AND creator.client_id = i.agency_id
      AND creator.role IN ('AGENCY_ADMIN', 'AGENT_ADMIN', 'GROUND_AGENT')
      AND creator.active
      AND (i.auth_user_id IS NULL OR i.auth_user_id = p_auth_user_id)
      AND (
        i.auth_user_id = p_auth_user_id
        OR (v_token IS NOT NULL AND i.token = v_token)
      )
    ORDER BY
      CASE
        WHEN i.auth_user_id = p_auth_user_id THEN 0
        ELSE 1
      END,
      i.created_at,
      i.id
    LIMIT 1
    FOR UPDATE OF i;
  END IF;

  IF v_invite_id IS NOT NULL AND v_confirmed THEN
    SELECT * INTO v_inv FROM public.invites WHERE id = v_invite_id;
    IF v_inv.status IS DISTINCT FROM 'pending' THEN
      v_invite_id := NULL;
    ELSIF NOT EXISTS (
      SELECT 1
      FROM public.users creator
      WHERE creator.id = v_inv.invited_by
        AND creator.client_id = v_inv.agency_id
        AND creator.role IN ('AGENCY_ADMIN', 'AGENT_ADMIN', 'GROUND_AGENT')
        AND creator.active
    ) THEN
      v_invite_id := NULL;
    ELSE
      v_db_role := CASE lower(trim(v_inv.role))
        WHEN 'client_admin' THEN 'AGENCY_ADMIN'
        WHEN 'agency_admin' THEN 'AGENCY_ADMIN'
        WHEN 'agent_admin' THEN 'AGENT_ADMIN'
        WHEN 'agent' THEN 'GROUND_AGENT'
        WHEN 'ground_agent' THEN 'GROUND_AGENT'
        WHEN 'landlord' THEN 'LANDLORD'
        WHEN 'contractor' THEN 'CONTRACTOR'
        WHEN 'tenant' THEN 'END_USER'
        WHEN 'applicant' THEN 'END_USER'
        WHEN 'end_user' THEN 'END_USER'
        ELSE NULL
      END;
      v_fe_role := CASE lower(trim(v_inv.role))
        WHEN 'client_admin' THEN 'client_admin'
        WHEN 'agency_admin' THEN 'client_admin'
        WHEN 'agent_admin' THEN 'agent_admin'
        WHEN 'agent' THEN 'agent'
        WHEN 'ground_agent' THEN 'ground_agent'
        WHEN 'landlord' THEN 'landlord'
        WHEN 'contractor' THEN 'contractor'
        WHEN 'tenant' THEN 'tenant'
        WHEN 'applicant' THEN 'tenant'
        WHEN 'end_user' THEN 'tenant'
        ELSE NULL
      END;
      -- super_admin / unknown roles are not a valid invite. Leave the row pending.
      IF v_db_role IS NULL OR v_fe_role IS NULL THEN
        v_invite_id := NULL;
      END IF;
    END IF;
  ELSE
    -- Unconfirmed users are not linked, even when a bound invite is waiting.
    v_invite_id := NULL;
  END IF;

  IF v_invite_id IS NOT NULL THEN
    SELECT id INTO v_mine FROM public.users WHERE auth_user_id = p_auth_user_id;

    v_target_id := NULL;
    SELECT id, auth_user_id, role, lower(trim(email))
      INTO v_target_id, v_target_auth, v_target_role, v_target_email
    FROM public.users
    WHERE lower(trim(email)) = v_email
    ORDER BY (auth_user_id IS NOT DISTINCT FROM p_auth_user_id) DESC, created_at
    LIMIT 1
    FOR UPDATE;
    IF FOUND THEN
      IF v_target_role = 'SUPER_ADMIN'
         OR (v_target_auth IS NOT NULL AND v_target_auth IS DISTINCT FROM p_auth_user_id)
         OR (v_mine IS NOT NULL AND v_target_id IS DISTINCT FROM v_mine) THEN
        v_target_id := NULL;
        v_invite_id := NULL;
      END IF;
    ELSIF v_mine IS NOT NULL THEN
      SELECT id, role
        INTO v_target_id, v_target_role
      FROM public.users
      WHERE id = v_mine AND lower(trim(email)) = v_email
      FOR UPDATE;
      IF NOT FOUND OR v_target_role = 'SUPER_ADMIN' THEN
        v_target_id := NULL;
        v_invite_id := NULL;
      END IF;
    END IF;

    IF v_invite_id IS NOT NULL THEN
      IF v_target_id IS NOT NULL THEN
        UPDATE public.users
        SET auth_user_id = p_auth_user_id,
            role = v_db_role,
            client_id = v_inv.agency_id,
            metadata = COALESCE(metadata, '{}'::jsonb)
              || jsonb_build_object('frontend_role', v_fe_role),
            updated_at = NOW()
        WHERE id = v_target_id
          AND role IS DISTINCT FROM 'SUPER_ADMIN'
          AND (auth_user_id IS NULL OR auth_user_id = p_auth_user_id);
        IF FOUND THEN
          v_linked_id := v_target_id;
        END IF;
      ELSE
        v_first := left(COALESCE(NULLIF(trim(v_meta->>'first_name'), ''), split_part(v_email, '@', 1), 'user'), 80);
        v_last := left(COALESCE(NULLIF(trim(v_meta->>'last_name'), ''), 'User'), 80);
        v_phone := left(NULLIF(trim(v_meta->>'phone'), ''), 40);
        v_linked_id := gen_random_uuid();
        v_fe_id := 'u-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
        v_user_meta := jsonb_build_object(
          'frontend_id', v_fe_id,
          'frontend_role', v_fe_role,
          'mustChangePassword', false
        );
        IF v_db_role IN ('LANDLORD', 'CONTRACTOR') THEN
          v_user_meta := v_user_meta || jsonb_build_object(
            'verification', jsonb_build_object(
              'status', 'pending',
              'submittedAt', to_jsonb(NOW()),
              'profile', COALESCE(v_meta->'profile', '{}'::jsonb),
              'documents', COALESCE(v_meta->'documents', '[]'::jsonb)
            )
          );
        ELSE
          v_user_meta := v_user_meta || jsonb_build_object(
            'verification', jsonb_build_object('status', 'not_required')
          );
        END IF;
        BEGIN
          INSERT INTO public.users (
            id, auth_user_id, client_id, email, password_hash,
            first_name, last_name, phone, role, active, metadata, updated_at
          ) VALUES (
            v_linked_id, p_auth_user_id, v_inv.agency_id, v_email, v_hash,
            v_first, v_last, v_phone, v_db_role, TRUE, v_user_meta, NOW()
          );
          INSERT INTO public.entity_id_map (entity_type, backend_id, frontend_id)
          VALUES ('user', v_linked_id, v_fe_id)
          ON CONFLICT (entity_type, backend_id) DO NOTHING;
        EXCEPTION
          WHEN unique_violation THEN
            v_linked_id := NULL;
        END;
      END IF;

      IF v_linked_id IS NOT NULL THEN
        UPDATE public.invites
        SET status = 'consumed',
            consumed_at = NOW(),
            auth_user_id = COALESCE(auth_user_id, p_auth_user_id)
        WHERE id = v_invite_id
          AND status = 'pending'
        RETURNING id INTO v_consumed;
        IF v_consumed IS NULL THEN
          RAISE EXCEPTION 'invite consume failed';
        END IF;
        RETURN v_linked_id;
      END IF;
    END IF;
  END IF;

  -- No authorized invite. Never update a profile just because the email matches.
  SELECT id INTO v_mine FROM public.users WHERE auth_user_id = p_auth_user_id LIMIT 1;
  IF v_mine IS NOT NULL THEN
    RETURN v_mine;
  END IF;

  IF v_email IS NULL OR EXISTS (
    SELECT 1 FROM public.users WHERE lower(trim(email)) = v_email
  ) THEN
    RETURN NULL;
  END IF;

  v_first := left(COALESCE(NULLIF(trim(v_meta->>'first_name'), ''), split_part(v_email, '@', 1), 'user'), 80);
  v_last := left(COALESCE(NULLIF(trim(v_meta->>'last_name'), ''), 'User'), 80);
  v_phone := left(NULLIF(trim(v_meta->>'phone'), ''), 40);
  v_linked_id := gen_random_uuid();
  v_fe_id := 'u-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  v_user_meta := jsonb_build_object(
    'frontend_id', v_fe_id,
    'frontend_role', 'tenant',
    'mustChangePassword', false,
    'verification', jsonb_build_object('status', 'not_required')
  );

  BEGIN
    INSERT INTO public.users (
      id, auth_user_id, client_id, email, password_hash,
      first_name, last_name, phone, role, active, metadata, updated_at
    ) VALUES (
      v_linked_id, p_auth_user_id, NULL, v_email, v_hash,
      v_first, v_last, v_phone, 'END_USER', TRUE, v_user_meta, NOW()
    );
    INSERT INTO public.entity_id_map (entity_type, backend_id, frontend_id)
    VALUES ('user', v_linked_id, v_fe_id)
    ON CONFLICT (entity_type, backend_id) DO NOTHING;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN NULL;
  END;

  RETURN v_linked_id;
END;
$$;

COMMENT ON FUNCTION public.sync_auth_user_profile(UUID) IS
  'Link auth.users to public.users. Email match alone does not re-link an existing profile. Invites are consumed once. Never grants SUPER_ADMIN.';

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
BEGIN
  PERFORM public.sync_auth_user_profile(NEW.id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_auth_user_email_confirmed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL AND OLD.email_confirmed_at IS NULL THEN
    PERFORM public.sync_auth_user_profile(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_invite_link()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM 'pending' THEN
    RETURN NEW;
  END IF;
  IF NEW.auth_user_id IS NOT NULL THEN
    PERFORM public.sync_auth_user_profile(NEW.auth_user_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_user_profile()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;
  RETURN public.sync_auth_user_profile(auth.uid()) IS NOT NULL;
END;
$$;

-- Binds a pending token to auth.uid() by setting auth_user_id when it is
-- still null. Linking still waits until that email is confirmed. Returns
-- false when the token is missing, already consumed, for a different email,
-- already bound to someone else, or not created by staff of that agency.
CREATE OR REPLACE FUNCTION public.redeem_invite_token(p_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_uid   UUID := auth.uid();
  v_email TEXT;
  v_id    UUID;
BEGIN
  IF v_uid IS NULL OR p_token IS NULL OR length(trim(p_token)) = 0 THEN
    RETURN FALSE;
  END IF;

  SELECT NULLIF(lower(trim(email)), '') INTO v_email
  FROM auth.users
  WHERE id = v_uid;

  IF v_email IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT i.id
    INTO v_id
  FROM public.invites i
  JOIN public.users creator ON creator.id = i.invited_by
  WHERE i.status = 'pending'
    AND i.token = trim(p_token)
    AND i.email = v_email
    AND creator.client_id = i.agency_id
    AND creator.role IN ('AGENCY_ADMIN', 'AGENT_ADMIN', 'GROUND_AGENT')
    AND creator.active
    AND (i.auth_user_id IS NULL OR i.auth_user_id = v_uid)
  FOR UPDATE OF i;

  IF v_id IS NULL THEN
    RETURN FALSE;
  END IF;

  UPDATE public.invites
  SET auth_user_id = COALESCE(auth_user_id, v_uid)
  WHERE id = v_id
    AND status = 'pending';

  -- The invite UPDATE trigger links immediately when the email is already confirmed.
  RETURN TRUE;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

DROP TRIGGER IF EXISTS on_auth_user_email_confirmed ON auth.users;
CREATE TRIGGER on_auth_user_email_confirmed
  AFTER UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_auth_user_email_confirmed();

DROP TRIGGER IF EXISTS invites_link_auth_user ON public.invites;
CREATE TRIGGER invites_link_auth_user
  AFTER INSERT OR UPDATE OF auth_user_id, token, status
  ON public.invites
  FOR EACH ROW
  WHEN (NEW.status = 'pending')
  EXECUTE FUNCTION public.handle_invite_link();

ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.invites FROM PUBLIC;

DO $grants$
BEGIN
  EXECUTE 'REVOKE ALL ON FUNCTION public.sync_auth_user_profile(uuid) FROM PUBLIC';
  EXECUTE 'REVOKE ALL ON FUNCTION public.ensure_user_profile() FROM PUBLIC';
  EXECUTE 'REVOKE ALL ON FUNCTION public.redeem_invite_token(text) FROM PUBLIC';

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.invites FROM anon';
    EXECUTE 'REVOKE ALL ON FUNCTION public.sync_auth_user_profile(uuid) FROM anon';
    EXECUTE 'REVOKE ALL ON FUNCTION public.ensure_user_profile() FROM anon';
    EXECUTE 'REVOKE ALL ON FUNCTION public.redeem_invite_token(text) FROM anon';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.invites FROM authenticated';
    EXECUTE 'REVOKE ALL ON FUNCTION public.sync_auth_user_profile(uuid) FROM authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.ensure_user_profile() TO authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.redeem_invite_token(text) TO authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.invites TO service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.sync_auth_user_profile(uuid) TO service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.redeem_invite_token(text) TO service_role';
    EXECUTE 'DROP POLICY IF EXISTS invites_server_all ON public.invites';
    EXECUTE 'CREATE POLICY invites_server_all ON public.invites FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'propertyflow_api') THEN
    CREATE ROLE propertyflow_api
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT BYPASSRLS;
  ELSE
    ALTER ROLE propertyflow_api NOSUPERUSER NOCREATEDB NOCREATEROLE BYPASSRLS;
  END IF;
  EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.invites TO propertyflow_api';
END
$grants$;

COMMIT;
