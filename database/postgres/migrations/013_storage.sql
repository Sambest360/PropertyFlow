-- Private object storage for property media and documents.
-- Apply with: psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f database/postgres/migrations/013_storage.sql
-- This file is not run by `npm run db:migrate` (that script only applies 001).
--
-- Moves file bytes out of Postgres. The SPA generates a UUID, uploads
-- {agency_id}/{entity_type}/{entity_id}/{file_id}.{ext} with upsert false, then
-- calls register_file. That function parses the id from the path, rejects it
-- when it is already registered, stores it as the primary key, and returns
-- the same id. It never mints a different one. The client then writes
-- pfstore:v1:{file_id} into the old string fields; this migration does not
-- store that prefix.
--
-- Reads: the client calls list_files({entity_type, entity_id}) and
-- list_files({file_id}). Both return {files:[{file_id, kind, url, expires_at}]}
-- with signed URLs valid for one hour. entity_files is the same listing as
-- list_files(entity_type, entity_id).
--
-- ID documents that still sit in users.metadata as data URLs
-- are moved by scripts/migrate-id-documents.ts together with
-- migrate_user_metadata_documents() (see the end of this file).
--
-- Depends on these helpers from database/postgres/migrations/002_supabase_auth.sql.
-- They are not redefined here:
--   auth.uid()
--   public.current_app_user_id()
--   public.current_app_client_id()
--   public.is_agency_staff()
-- Agency ownership reuses public.entity_backend_client_id() from
-- 011c_security_review.sql (unit, building, user, application, and lease via
-- the 'tenancy' type). 011 does not define a party helper. Party checks stay
-- in public.storage_caller_is_party(). Ticket agency is read here because
-- entity_backend_client_id does not cover maintenance_tickets.
-- Apply 011 and 011c before this file. 011c forces row level security on the
-- tenant tables, so every lookup runs as SECURITY DEFINER with a pinned
-- search_path. The function owner is the migration role (postgres on
-- Supabase), which has BYPASSRLS, so forced RLS does not hide those rows.
--
-- Applicants who do not belong to an agency yet upload an ID document to
-- documents/_users/{auth.uid()}/id_document/{file_id}.{ext}. register_file
-- is called with entity_type 'user' and entity_id = auth.uid(). Only that
-- user can write. Only that user, and staff of an agency the user has applied
-- to, can read. The file is stored with a null agency_id.
--
-- Access:
--   * Agency staff (AGENCY_ADMIN, AGENT_ADMIN, GROUND_AGENT) read and upload only
--     inside their own agency.
--   * Tenants and applicants upload only when they are a party on the entity
--     (their application, lease, or maintenance ticket, or their own user row
--     for an ID document) and only under that entity's agency path. They read
--     only files they uploaded.
--   * An ID document at _users/{auth.uid()} is the exception above: no agency
--     path, and staff read it only after an application to their agency.
--   * Everyone else, including anon and super admins, gets nothing.
-- There is no UPDATE policy. Upsert / overwrite fails. Uploaders may delete
-- their own objects until register_file records them. sweep_unregistered_storage()
-- removes unregistered objects older than 24 hours.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgjwt WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ---------------------------------------------------------------------------
-- Buckets. Limits are also enforced by the INSERT policies below.
-- Images: jpeg / png / webp, 10 MiB. Documents: pdf / jpeg / png, 20 MiB.
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'property-media',
    'property-media',
    false,
    10485760,
    ARRAY['image/jpeg', 'image/png', 'image/webp']
  ),
  (
    'documents',
    'documents',
    false,
    20971520,
    ARRAY['application/pdf', 'image/jpeg', 'image/png']
  )
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Registry. The id is the file_id embedded in the object path. Rows are
-- inserted only by register_file / the ID-document migration, both of which
-- run as the table owner and bypass RLS.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.stored_files (
  id            UUID PRIMARY KEY,
  bucket        TEXT NOT NULL CHECK (bucket IN ('property-media', 'documents')),
  path          TEXT NOT NULL,
  agency_id     UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  entity_type   TEXT NOT NULL CHECK (entity_type IN (
                  'application', 'lease', 'ticket', 'maintenance_ticket',
                  'user', 'unit', 'building'
                )),
  entity_id     UUID NOT NULL,
  kind          TEXT NOT NULL CHECK (kind ~ '^[A-Za-z0-9_.:-]{1,80}$'),
  mime_type     TEXT NOT NULL,
  byte_size     BIGINT NOT NULL CHECK (byte_size > 0),
  uploaded_by   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT stored_files_bucket_path_key UNIQUE (bucket, path)
);

-- Re-apply: the first version of this table required an agency. Registration
-- ID documents have none. Every other row still must.
ALTER TABLE public.stored_files ALTER COLUMN agency_id DROP NOT NULL;
ALTER TABLE public.stored_files DROP CONSTRAINT IF EXISTS stored_files_agency_required;
ALTER TABLE public.stored_files ADD CONSTRAINT stored_files_agency_required CHECK (
  agency_id IS NOT NULL
  OR (
    bucket = 'documents'
    AND entity_type = 'user'
    AND path ~ '^_users/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/id_document/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|jpeg|png)$'
  )
);

CREATE INDEX IF NOT EXISTS stored_files_entity_idx
  ON public.stored_files (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS stored_files_agency_idx
  ON public.stored_files (agency_id);
CREATE INDEX IF NOT EXISTS stored_files_uploaded_by_idx
  ON public.stored_files (uploaded_by);

ALTER TABLE public.stored_files ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.stored_files FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.stored_files TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.stored_files TO service_role;

-- ---------------------------------------------------------------------------
-- Path and party checks. SECURITY DEFINER with a pinned search_path so 011c's
-- FORCE ROW LEVEL SECURITY does not hide the entity from the caller. The
-- owner is the migration role, which bypasses RLS. Each function returns only
-- a boolean or an id, and each requires auth.uid() where it decides access.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.storage_entity_agency(
  p_entity_type TEXT,
  p_entity_id UUID
)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE p_entity_type
    WHEN 'lease' THEN public.entity_backend_client_id('tenancy', p_entity_id)
    WHEN 'ticket' THEN (SELECT client_id FROM public.maintenance_tickets WHERE id = p_entity_id)
    WHEN 'maintenance_ticket' THEN (SELECT client_id FROM public.maintenance_tickets WHERE id = p_entity_id)
    ELSE public.entity_backend_client_id(p_entity_type, p_entity_id)
  END;
$$;

CREATE OR REPLACE FUNCTION public.storage_caller_is_party(
  p_entity_type TEXT,
  p_entity_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL OR public.current_app_user_id() IS NULL THEN FALSE
    WHEN p_entity_type = 'application' THEN EXISTS (
      SELECT 1 FROM applications a
      WHERE a.id = p_entity_id AND a.applicant_id = public.current_app_user_id()
    )
    WHEN p_entity_type = 'lease' THEN EXISTS (
      SELECT 1 FROM leases l
      WHERE l.id = p_entity_id AND l.tenant_id = public.current_app_user_id()
    )
    WHEN p_entity_type IN ('ticket', 'maintenance_ticket') THEN EXISTS (
      SELECT 1 FROM maintenance_tickets t
      WHERE t.id = p_entity_id
        AND (
          t.reported_by = public.current_app_user_id()
          OR EXISTS (
            SELECT 1 FROM leases l
            WHERE l.id = t.lease_id AND l.tenant_id = public.current_app_user_id()
          )
          OR EXISTS (
            SELECT 1 FROM leases l
            WHERE l.unit_id = t.unit_id
              AND l.tenant_id = public.current_app_user_id()
              AND l.status IN ('PENDING', 'ACTIVE', 'NOTICE')
          )
        )
    )
    WHEN p_entity_type = 'user' THEN p_entity_id = public.current_app_user_id()
    ELSE FALSE
  END;
$$;

-- Path shape: {agency_id}/{entity_type}/{entity_id}/{file_id}.{ext}
-- True when the caller is staff of that agency, or a party on the entity,
-- and the agency segment matches the entity's agency.
CREATE OR REPLACE FUNCTION public.storage_upload_authorized(object_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  folders TEXT[];
  agency UUID;
  entity_type TEXT;
  entity_id UUID;
  file_name TEXT;
  file_stem TEXT;
  ext TEXT;
  entity_agency UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;

  folders := storage.foldername(object_name);
  IF folders IS NULL OR cardinality(folders) <> 3 THEN
    RETURN FALSE;
  END IF;
  IF folders[1] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     OR folders[3] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN FALSE;
  END IF;

  agency := folders[1]::UUID;
  entity_type := folders[2];
  entity_id := folders[3]::UUID;
  IF entity_type NOT IN (
    'application', 'lease', 'ticket', 'maintenance_ticket', 'user', 'unit', 'building'
  ) THEN
    RETURN FALSE;
  END IF;

  file_name := storage.filename(object_name);
  ext := lower(storage.extension(object_name));
  file_stem := split_part(file_name, '.', 1);
  IF file_name IS NULL OR ext IS NULL OR ext = '' OR file_stem !~* '^[0-9a-f-]{36}$' THEN
    RETURN FALSE;
  END IF;
  IF lower(file_name) <> lower(file_stem) || '.' || ext THEN
    RETURN FALSE;
  END IF;

  entity_agency := public.storage_entity_agency(entity_type, entity_id);
  IF entity_agency IS NULL OR entity_agency <> agency THEN
    RETURN FALSE;
  END IF;

  IF public.is_agency_staff() AND public.current_app_client_id() = agency THEN
    RETURN TRUE;
  END IF;
  RETURN public.storage_caller_is_party(entity_type, entity_id);
END;
$$;

-- documents/_users/{auth_user_id}/id_document/{file_id}.{ext}
-- Returns the auth user id when the path is that shape, otherwise NULL.
CREATE OR REPLACE FUNCTION public.storage_registration_id_owner(object_name TEXT)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  folders TEXT[];
  owner_id UUID;
  stem TEXT;
  ext TEXT;
BEGIN
  folders := storage.foldername(object_name);
  IF folders IS NULL OR cardinality(folders) <> 3 THEN
    RETURN NULL;
  END IF;
  IF folders[1] <> '_users' OR folders[3] <> 'id_document' THEN
    RETURN NULL;
  END IF;
  IF folders[2] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN NULL;
  END IF;
  ext := lower(storage.extension(object_name));
  IF ext NOT IN ('pdf', 'jpg', 'jpeg', 'png') THEN
    RETURN NULL;
  END IF;
  stem := split_part(storage.filename(object_name), '.', 1);
  IF stem !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN NULL;
  END IF;
  IF lower(storage.filename(object_name)) IS DISTINCT FROM lower(stem) || '.' || ext THEN
    RETURN NULL;
  END IF;
  owner_id := folders[2]::UUID;
  IF lower(folders[2]) IS DISTINCT FROM owner_id::TEXT THEN
    RETURN NULL;
  END IF;
  IF lower(stem) IS DISTINCT FROM stem::UUID::TEXT THEN
    RETURN NULL;
  END IF;
  RETURN owner_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.storage_user_id_upload_ok(object_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND public.storage_registration_id_owner(object_name) = auth.uid();
$$;

-- The user named in the path, or staff of an agency that user has applied to.
CREATE OR REPLACE FUNCTION public.storage_user_id_readable(p_auth_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND p_auth_user_id IS NOT NULL
    AND (
      auth.uid() = p_auth_user_id
      OR (
        public.is_agency_staff()
        AND public.current_app_client_id() IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.applications a
          JOIN public.users u ON u.id = a.applicant_id
          WHERE u.auth_user_id = p_auth_user_id
            AND a.client_id = public.current_app_client_id()
        )
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.storage_object_readable(
  p_bucket TEXT,
  object_name TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND (
      (
        public.is_agency_staff()
        AND lower((storage.foldername(object_name))[1])
            = lower(public.current_app_client_id()::TEXT)
      )
      OR EXISTS (
        SELECT 1 FROM public.stored_files f
        WHERE f.bucket = p_bucket
          AND f.path = object_name
          AND f.uploaded_by = public.current_app_user_id()
          AND public.storage_caller_is_party(f.entity_type, f.entity_id)
      )
      OR (
        p_bucket = 'documents'
        AND public.storage_user_id_readable(public.storage_registration_id_owner(object_name))
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.storage_can_delete_unregistered(
  p_bucket TEXT,
  object_name TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM storage.objects o
      WHERE o.bucket_id = p_bucket
        AND o.name = object_name
        AND o.archived_at IS NULL
        AND (o.owner = auth.uid() OR o.owner_id = auth.uid()::TEXT)
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.stored_files f
      WHERE f.bucket = p_bucket AND f.path = object_name
    );
$$;

REVOKE ALL ON FUNCTION public.storage_entity_agency(TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.storage_caller_is_party(TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.storage_upload_authorized(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.storage_object_readable(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.storage_can_delete_unregistered(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.storage_registration_id_owner(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.storage_user_id_upload_ok(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.storage_user_id_readable(UUID) FROM PUBLIC;
-- Policies run as the current user, so the role needs EXECUTE. The functions
-- return booleans or an id only.
GRANT EXECUTE ON FUNCTION public.storage_upload_authorized(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.storage_object_readable(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.storage_caller_is_party(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.storage_can_delete_unregistered(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.storage_user_id_upload_ok(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.storage_user_id_readable(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.storage_registration_id_owner(TEXT) TO authenticated;

DROP POLICY IF EXISTS stored_files_select ON public.stored_files;
CREATE POLICY stored_files_select ON public.stored_files
  FOR SELECT TO authenticated
  USING (
    (
      (SELECT public.is_agency_staff())
      AND agency_id = (SELECT public.current_app_client_id())
    )
    OR (
      uploaded_by = (SELECT public.current_app_user_id())
      AND (SELECT public.storage_caller_is_party(entity_type, entity_id))
    )
    OR (
      entity_type = 'user'
      AND path LIKE '\_users/%/id\_document/%' ESCAPE '\'
      AND (SELECT public.storage_user_id_readable(entity_id))
    )
  );

-- ---------------------------------------------------------------------------
-- storage.objects policies. No UPDATE policy: overwrite / upsert fails.
-- Anon has no policy, so anon receives nothing. RLS is already on in Supabase;
-- enable it again so a database that turned it off does not publish objects.
-- ---------------------------------------------------------------------------

-- postgres cannot own storage.objects after supabase migration
-- 20250421084701_revoke_admin_roles_from_postgres. Policies are created as
-- the table owner. The session must be allowed to assume that role
-- (supabase_admin can; postgres can where the membership is still granted).
SET ROLE supabase_storage_admin;

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS property_media_insert ON storage.objects;
CREATE POLICY property_media_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'property-media'
    AND (
      (metadata->>'mimetype' = 'image/jpeg' AND lower(storage.extension(name)) IN ('jpg', 'jpeg'))
      OR (metadata->>'mimetype' = 'image/png' AND lower(storage.extension(name)) = 'png')
      OR (metadata->>'mimetype' = 'image/webp' AND lower(storage.extension(name)) = 'webp')
    )
    AND coalesce(
          NULLIF(metadata->>'contentLength', '')::BIGINT,
          NULLIF(metadata->>'size', '')::BIGINT
        ) BETWEEN 1 AND 10485760
    AND public.storage_upload_authorized(name)
  );

DROP POLICY IF EXISTS documents_insert ON storage.objects;
CREATE POLICY documents_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'documents'
    AND (
      (metadata->>'mimetype' = 'application/pdf' AND lower(storage.extension(name)) = 'pdf')
      OR (metadata->>'mimetype' = 'image/jpeg' AND lower(storage.extension(name)) IN ('jpg', 'jpeg'))
      OR (metadata->>'mimetype' = 'image/png' AND lower(storage.extension(name)) = 'png')
    )
    AND coalesce(
          NULLIF(metadata->>'contentLength', '')::BIGINT,
          NULLIF(metadata->>'size', '')::BIGINT
        ) BETWEEN 1 AND 20971520
    AND (
      public.storage_upload_authorized(name)
      OR public.storage_user_id_upload_ok(name)
    )
  );

DROP POLICY IF EXISTS stored_objects_select ON storage.objects;
CREATE POLICY stored_objects_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id IN ('property-media', 'documents')
    AND archived_at IS NULL
    AND public.storage_object_readable(bucket_id, name)
  );

DROP POLICY IF EXISTS stored_objects_delete_unregistered ON storage.objects;
CREATE POLICY stored_objects_delete_unregistered ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id IN ('property-media', 'documents')
    AND public.storage_can_delete_unregistered(bucket_id, name)
  );

DROP POLICY IF EXISTS property_media_update ON storage.objects;
DROP POLICY IF EXISTS documents_update ON storage.objects;
DROP POLICY IF EXISTS stored_objects_update ON storage.objects;

RESET ROLE;

-- ---------------------------------------------------------------------------
-- Signed URLs. The signing key and the public API origin live in Vault.
-- They are not hardcoded. Configure them once per environment:
--   SELECT vault.create_secret('<jwt secret>', 'storage_jwt_secret', 'HMAC key for storage download tokens');
--   SELECT vault.create_secret('https://<project>.supabase.co', 'supabase_url', 'Public API origin, no trailing path');
--   SELECT vault.create_secret('<service role jwt>', 'storage_service_role_key', 'Storage API bearer for sweep and ID migration');
--   SELECT vault.create_secret('http://kong:8000', 'storage_api_url', 'Storage origin reachable from the database');
-- Local supabase start uses JWT secret
--   super-secret-jwt-token-with-at-least-32-characters-long
-- and public origin http://127.0.0.1:54321. From inside the DB container the
-- API is http://kong:8000.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.storage_signed_url(
  p_bucket TEXT,
  p_path TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  secret TEXT;
  base TEXT;
  token TEXT;
  exp INTEGER;
  iat INTEGER;
BEGIN
  SELECT decrypted_secret INTO secret
  FROM vault.decrypted_secrets
  WHERE name = 'storage_jwt_secret'
  ORDER BY created_at DESC
  LIMIT 1;
  SELECT decrypted_secret INTO base
  FROM vault.decrypted_secrets
  WHERE name = 'supabase_url'
  ORDER BY created_at DESC
  LIMIT 1;
  IF secret IS NULL OR base IS NULL THEN
    RAISE EXCEPTION 'storage signing is not configured'
      USING ERRCODE = '42501',
            HINT = 'Create vault secrets storage_jwt_secret and supabase_url';
  END IF;
  iat := extract(EPOCH FROM now())::INTEGER;
  exp := extract(EPOCH FROM now() + INTERVAL '1 hour')::INTEGER;
  token := extensions.sign(
    json_build_object(
      'url', p_bucket || '/' || p_path,
      'scope', 'download',
      'iat', iat,
      'exp', exp
    ),
    secret,
    'HS256'
  );
  RETURN rtrim(base, '/') || '/storage/v1/object/sign/' || p_bucket || '/' || p_path || '?token=' || token;
END;
$$;

REVOKE ALL ON FUNCTION public.storage_signed_url(TEXT, TEXT) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- register_file({bucket, path, entity_type, entity_id, kind}) -> {file_id}
-- The file_id is the UUID the client already put in the path. This function
-- parses it, rejects a non-UUID, rejects an id or path that is already
-- registered, uses it as stored_files.id, and returns that same id.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.register_file(
  bucket TEXT,
  path TEXT,
  entity_type TEXT,
  entity_id UUID,
  kind TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  folders TEXT[];
  path_agency UUID;
  path_entity UUID;
  file_id UUID;
  ext TEXT;
  entity_agency UUID;
  obj_owner UUID;
  obj_owner_id TEXT;
  obj_meta JSONB;
  obj_mime TEXT;
  obj_size BIGINT;
BEGIN
  IF auth.uid() IS NULL OR public.current_app_user_id() IS NULL THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  IF bucket NOT IN ('property-media', 'documents') THEN
    RAISE EXCEPTION 'Invalid bucket' USING ERRCODE = '22023';
  END IF;
  IF kind IS NULL OR kind !~ '^[A-Za-z0-9_.:-]{1,80}$' THEN
    RAISE EXCEPTION 'Invalid kind' USING ERRCODE = '22023';
  END IF;
  IF entity_type NOT IN (
    'application', 'lease', 'ticket', 'maintenance_ticket', 'user', 'unit', 'building'
  ) THEN
    RAISE EXCEPTION 'Invalid entity' USING ERRCODE = '22023';
  END IF;

  folders := storage.foldername(path);
  IF folders IS NULL OR cardinality(folders) <> 3 THEN
    RAISE EXCEPTION 'Invalid path' USING ERRCODE = '22023';
  END IF;

  IF folders[1] = '_users' THEN
    -- Registration ID document. No agency. entity_id must be auth.uid().
    IF bucket <> 'documents' OR entity_type <> 'user' OR kind <> 'id_document' THEN
      RAISE EXCEPTION 'Invalid path' USING ERRCODE = '22023';
    END IF;
    IF entity_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
    END IF;
    path_entity := public.storage_registration_id_owner(path);
    IF path_entity IS NULL THEN
      RAISE EXCEPTION 'Invalid path' USING ERRCODE = '22023';
    END IF;
    IF path_entity IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
    END IF;
    file_id := split_part(storage.filename(path), '.', 1)::UUID;
    ext := lower(storage.extension(path));
    entity_agency := NULL;
  ELSE
    BEGIN
      path_agency := folders[1]::UUID;
      path_entity := folders[3]::UUID;
      file_id := split_part(storage.filename(path), '.', 1)::UUID;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Invalid file id' USING ERRCODE = '22023';
    END;
    -- Reject non-canonical forms. The returned id must be the path segment.
    IF lower(split_part(storage.filename(path), '.', 1)) IS DISTINCT FROM file_id::TEXT THEN
      RAISE EXCEPTION 'Invalid file id' USING ERRCODE = '22023';
    END IF;
    ext := lower(storage.extension(path));
    IF folders[2] IS DISTINCT FROM entity_type OR path_entity IS DISTINCT FROM entity_id THEN
      RAISE EXCEPTION 'Invalid path' USING ERRCODE = '22023';
    END IF;
    IF lower(storage.filename(path)) IS DISTINCT FROM file_id::TEXT || '.' || ext THEN
      RAISE EXCEPTION 'Invalid path' USING ERRCODE = '22023';
    END IF;

    entity_agency := public.storage_entity_agency(entity_type, entity_id);
    IF entity_agency IS NULL OR entity_agency IS DISTINCT FROM path_agency THEN
      RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
    END IF;
    IF NOT (
      (public.is_agency_staff() AND public.current_app_client_id() = entity_agency)
      OR public.storage_caller_is_party(entity_type, entity_id)
    ) THEN
      RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT o.owner, o.owner_id, o.metadata
    INTO obj_owner, obj_owner_id, obj_meta
  FROM storage.objects o
  WHERE o.bucket_id = bucket
    AND o.name = path
    AND o.archived_at IS NULL
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Object not found' USING ERRCODE = 'P0002';
  END IF;
  IF obj_owner IS DISTINCT FROM auth.uid() AND obj_owner_id IS DISTINCT FROM auth.uid()::TEXT THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  obj_mime := obj_meta->>'mimetype';
  obj_size := coalesce(
    NULLIF(obj_meta->>'contentLength', '')::BIGINT,
    NULLIF(obj_meta->>'size', '')::BIGINT
  );
  IF bucket = 'property-media' THEN
    IF obj_mime NOT IN ('image/jpeg', 'image/png', 'image/webp')
       OR ext NOT IN ('jpg', 'jpeg', 'png', 'webp')
       OR obj_size IS NULL OR obj_size < 1 OR obj_size > 10485760 THEN
      RAISE EXCEPTION 'File not allowed' USING ERRCODE = '22023';
    END IF;
  ELSE
    IF obj_mime NOT IN ('application/pdf', 'image/jpeg', 'image/png')
       OR ext NOT IN ('pdf', 'jpg', 'jpeg', 'png')
       OR obj_size IS NULL OR obj_size < 1 OR obj_size > 20971520 THEN
      RAISE EXCEPTION 'File not allowed' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.stored_files f
    WHERE f.id = file_id
       OR (f.bucket = register_file.bucket AND f.path = register_file.path)
  ) THEN
    RAISE EXCEPTION 'Already registered' USING ERRCODE = '23505';
  END IF;

  BEGIN
    INSERT INTO public.stored_files (
      id, bucket, path, agency_id, entity_type, entity_id, kind, mime_type, byte_size, uploaded_by
    ) VALUES (
      file_id, bucket, path, entity_agency, entity_type, entity_id, kind, obj_mime, obj_size,
      public.current_app_user_id()
    );
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Already registered' USING ERRCODE = '23505';
  END;
  RETURN jsonb_build_object('file_id', file_id);
END;
$$;

REVOKE ALL ON FUNCTION public.register_file(TEXT, TEXT, TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_file(TEXT, TEXT, TEXT, UUID, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- list_files({entity_type, entity_id}) and list_files({file_id})
-- -> {files:[{file_id, kind, url, expires_at}]}
-- Signed URLs expire one hour after the call. entity_files is the entity form.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.list_files(
  entity_type TEXT,
  entity_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  entity_agency UUID;
  staff BOOLEAN;
  party BOOLEAN;
  expires TIMESTAMPTZ;
  files JSONB;
BEGIN
  IF auth.uid() IS NULL OR public.current_app_user_id() IS NULL THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  IF entity_type NOT IN (
    'application', 'lease', 'ticket', 'maintenance_ticket', 'user', 'unit', 'building'
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF entity_type = 'user' AND public.storage_user_id_readable(entity_id) THEN
    expires := now() + INTERVAL '1 hour';
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'file_id', f.id,
      'kind', f.kind,
      'url', public.storage_signed_url(f.bucket, f.path),
      'expires_at', expires
    ) ORDER BY f.created_at, f.id), '[]'::JSONB)
    INTO files
    FROM public.stored_files f
    WHERE f.entity_type = 'user'
      AND f.entity_id = list_files.entity_id
      AND f.bucket = 'documents'
      AND f.path LIKE '\_users/%/id\_document/%' ESCAPE '\';
    RETURN jsonb_build_object('files', files);
  END IF;

  entity_agency := public.storage_entity_agency(entity_type, entity_id);
  staff := public.is_agency_staff() AND public.current_app_client_id() = entity_agency;
  party := public.storage_caller_is_party(entity_type, entity_id);
  IF entity_agency IS NULL OR (NOT staff AND NOT party) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  expires := now() + INTERVAL '1 hour';
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'file_id', f.id,
    'kind', f.kind,
    'url', public.storage_signed_url(f.bucket, f.path),
    'expires_at', expires
  ) ORDER BY f.created_at, f.id), '[]'::JSONB)
  INTO files
  FROM public.stored_files f
  WHERE f.entity_type = list_files.entity_type
    AND f.entity_id = list_files.entity_id
    AND (staff OR f.uploaded_by = public.current_app_user_id());

  RETURN jsonb_build_object('files', files);
END;
$$;

CREATE OR REPLACE FUNCTION public.entity_files(
  entity_type TEXT,
  entity_id UUID
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.list_files(entity_type, entity_id);
$$;

CREATE OR REPLACE FUNCTION public.list_files(
  file_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row public.stored_files%ROWTYPE;
  staff BOOLEAN;
  party BOOLEAN;
  expires TIMESTAMPTZ;
BEGIN
  IF auth.uid() IS NULL OR public.current_app_user_id() IS NULL THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO row FROM public.stored_files f WHERE f.id = file_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not found' USING ERRCODE = 'P0002';
  END IF;

  IF row.entity_type = 'user'
     AND row.path LIKE '\_users/%/id\_document/%' ESCAPE '\' THEN
    IF NOT public.storage_user_id_readable(row.entity_id) THEN
      RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
    END IF;
    expires := now() + INTERVAL '1 hour';
    RETURN jsonb_build_object(
      'files',
      jsonb_build_array(jsonb_build_object(
        'file_id', row.id,
        'kind', row.kind,
        'url', public.storage_signed_url(row.bucket, row.path),
        'expires_at', expires
      ))
    );
  END IF;

  staff := public.is_agency_staff() AND public.current_app_client_id() = row.agency_id;
  party := row.uploaded_by = public.current_app_user_id()
    AND public.storage_caller_is_party(row.entity_type, row.entity_id);
  IF NOT staff AND NOT party THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  expires := now() + INTERVAL '1 hour';
  RETURN jsonb_build_object(
    'files',
    jsonb_build_array(jsonb_build_object(
      'file_id', row.id,
      'kind', row.kind,
      'url', public.storage_signed_url(row.bucket, row.path),
      'expires_at', expires
    ))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.list_files(TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_files(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.entity_files(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_files(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_files(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.entity_files(TEXT, UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- Sweep. Prefers the Storage API (deletes the blob and the catalog row).
-- Falls back to a catalog delete when the API secrets are not configured.
-- Scheduled hourly. Uploaders can also delete their own unregistered objects
-- immediately through the DELETE policy.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sweep_unregistered_storage()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault, storage
AS $$
DECLARE
  api TEXT;
  key TEXT;
  removed INTEGER := 0;
  batch_count INTEGER;
  rec RECORD;
  resp extensions.http_response;
BEGIN
  IF auth.uid() IS NOT NULL OR current_user IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT decrypted_secret INTO api
  FROM vault.decrypted_secrets WHERE name = 'storage_api_url'
  ORDER BY created_at DESC LIMIT 1;
  IF api IS NULL THEN
    SELECT decrypted_secret INTO api
    FROM vault.decrypted_secrets WHERE name = 'supabase_url'
    ORDER BY created_at DESC LIMIT 1;
  END IF;
  SELECT decrypted_secret INTO key
  FROM vault.decrypted_secrets WHERE name = 'storage_service_role_key'
  ORDER BY created_at DESC LIMIT 1;

  IF api IS NOT NULL AND key IS NOT NULL THEN
    FOR rec IN
      SELECT o.bucket_id,
             jsonb_agg(o.name) AS names,
             count(*)::INTEGER AS cnt
      FROM storage.objects o
      WHERE o.bucket_id IN ('property-media', 'documents')
        AND o.created_at < now() - INTERVAL '24 hours'
        AND o.archived_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.stored_files f
          WHERE f.bucket = o.bucket_id AND f.path = o.name
        )
      GROUP BY o.bucket_id
    LOOP
      resp := extensions.http((
        'DELETE',
        rtrim(api, '/') || '/storage/v1/object/' || rec.bucket_id,
        ARRAY[
          extensions.http_header('Authorization', 'Bearer ' || key),
          extensions.http_header('apikey', key),
          extensions.http_header('Content-Type', 'application/json')
        ],
        'application/json',
        jsonb_build_object('prefixes', rec.names)::TEXT
      )::extensions.http_request);
      IF resp.status < 200 OR resp.status >= 300 THEN
        RAISE EXCEPTION 'storage sweep failed for bucket % (%): %',
          rec.bucket_id, resp.status, left(coalesce(resp.content, ''), 400)
          USING ERRCODE = '57014';
      END IF;
      removed := removed + rec.cnt;
    END LOOP;
    RETURN removed;
  END IF;

  PERFORM set_config('storage.allow_delete_query', 'true', true);
  DELETE FROM storage.objects o
  WHERE o.bucket_id IN ('property-media', 'documents')
    AND o.created_at < now() - INTERVAL '24 hours'
    AND NOT EXISTS (
      SELECT 1 FROM public.stored_files f
      WHERE f.bucket = o.bucket_id AND f.path = o.name
    );
  GET DIAGNOSTICS batch_count = ROW_COUNT;
  RETURN batch_count;
END;
$$;

REVOKE ALL ON FUNCTION public.sweep_unregistered_storage() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sweep_unregistered_storage() TO service_role;

DO $$
BEGIN
  PERFORM cron.unschedule('sweep-unregistered-storage');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'sweep-unregistered-storage',
  '17 * * * *',
  $$SELECT public.sweep_unregistered_storage()$$
);

-- ---------------------------------------------------------------------------
-- ID documents in users.metadata.
--
-- Existing rows keep their data URLs until both steps have run:
--   1. Upload each planned object with the service role (upsert false) to the
--      path metadata_document_plan() returns. scripts/migrate-id-documents.ts
--      does this.
--   2. SELECT public.migrate_user_metadata_documents();
--      That registers the file and removes the data URL. It does not delete a
--      data URL whose object is not in storage yet, so it is safe to re-run.
--
-- file_id is uuid v5 of (user id, document key, md5 of the data URL) under
-- the namespace below, so the path is stable across retries.
-- A user with a client_id is stored at {client_id}/user/{user_id}/{file_id}.ext.
-- A user with no client_id and an auth user id stores an ID document
-- (key id_copy or id_document) at _users/{auth_user_id}/id_document/{file_id}.ext.
-- Anything else outside the documents bucket limits is left untouched.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.metadata_document_plan()
RETURNS TABLE (
  user_id UUID,
  doc_index INTEGER,
  doc_key TEXT,
  file_id UUID,
  bucket TEXT,
  path TEXT,
  mime_type TEXT,
  byte_size BIGINT,
  data_url TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  ns UUID := '6f9c2e1a-0b4d-5e7f-8a1c-2d3e4f506172';
  rec RECORD;
  raw TEXT;
  mime TEXT;
  b64 TEXT;
  bytes BYTEA;
  ext TEXT;
  fid UUID;
  doc_key_text TEXT;
BEGIN
  -- Service and migration connections only. Never an end-user JWT.
  IF auth.uid() IS NOT NULL OR current_user IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  FOR rec IN
    SELECT u.id AS uid,
           u.client_id,
           u.auth_user_id,
           (doc.ordinality - 1)::INTEGER AS idx,
           doc.elem
    FROM (
      SELECT id, client_id, auth_user_id, metadata
      FROM users
      WHERE jsonb_typeof(metadata->'verification'->'documents') = 'array'
        AND (client_id IS NOT NULL OR auth_user_id IS NOT NULL)
    ) u
    CROSS JOIN LATERAL jsonb_array_elements(u.metadata->'verification'->'documents')
         WITH ORDINALITY AS doc(elem, ordinality)
    WHERE coalesce(doc.elem->>'dataUrl', '') LIKE 'data:%'
      AND (
        u.client_id IS NOT NULL
        OR coalesce(doc.elem->>'key', '') IN ('id_copy', 'id_document')
      )
  LOOP
    raw := rec.elem->>'dataUrl';
    mime := lower(substring(raw FROM '^data:([^;,]+)'));
    b64 := substring(raw FROM 'base64,(.*)$');
    ext := CASE mime
      WHEN 'application/pdf' THEN 'pdf'
      WHEN 'image/jpeg' THEN 'jpg'
      WHEN 'image/png' THEN 'png'
      ELSE NULL
    END;
    doc_key_text := coalesce(rec.elem->>'key', 'id_document');
    IF doc_key_text !~ '^[A-Za-z0-9_.:-]{1,80}$' THEN
      doc_key_text := 'id_document';
    END IF;
    IF ext IS NOT NULL AND b64 IS NOT NULL THEN
      BEGIN
        bytes := decode(regexp_replace(b64, '\s', '', 'g'), 'base64');
      EXCEPTION WHEN OTHERS THEN
        bytes := NULL;
      END;
      IF bytes IS NOT NULL AND octet_length(bytes) BETWEEN 1 AND 20971520
         AND (rec.client_id IS NOT NULL OR rec.auth_user_id IS NOT NULL) THEN
        fid := extensions.uuid_generate_v5(
          ns,
          rec.uid::TEXT || '/' || doc_key_text || '/' || md5(raw)
        );
        user_id := rec.uid;
        doc_index := rec.idx;
        doc_key := doc_key_text;
        file_id := fid;
        bucket := 'documents';
        IF rec.client_id IS NULL THEN
          path := '_users/' || rec.auth_user_id::TEXT || '/id_document/' || fid::TEXT || '.' || ext;
        ELSE
          path := rec.client_id::TEXT || '/user/' || rec.uid::TEXT || '/' || fid::TEXT || '.' || ext;
        END IF;
        mime_type := mime;
        byte_size := octet_length(bytes);
        data_url := raw;
        RETURN NEXT;
      END IF;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.migrate_user_metadata_documents()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec RECORD;
  obj_meta JSONB;
  migrated INTEGER := 0;
  pending INTEGER := 0;
  meta JSONB;
  docs JSONB;
BEGIN
  IF auth.uid() IS NOT NULL OR current_user IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  FOR rec IN SELECT * FROM public.metadata_document_plan() LOOP
    SELECT o.metadata INTO obj_meta
    FROM storage.objects o
    WHERE o.bucket_id = rec.bucket
      AND o.name = rec.path
      AND o.archived_at IS NULL
    LIMIT 1;
    IF NOT FOUND THEN
      pending := pending + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.stored_files (
      id, bucket, path, agency_id, entity_type, entity_id, kind, mime_type, byte_size, uploaded_by
    )
    SELECT
      rec.file_id,
      rec.bucket,
      rec.path,
      CASE WHEN rec.path LIKE '\_users/%' ESCAPE '\' THEN NULL ELSE u.client_id END,
      'user',
      CASE WHEN rec.path LIKE '\_users/%' ESCAPE '\' THEN u.auth_user_id ELSE u.id END,
      CASE WHEN rec.path LIKE '\_users/%' ESCAPE '\' THEN 'id_document' ELSE rec.doc_key END,
      rec.mime_type,
      rec.byte_size,
      u.id
    FROM users u
    WHERE u.id = rec.user_id
      AND (
        rec.path NOT LIKE '\_users/%' ESCAPE '\'
        OR u.auth_user_id IS NOT NULL
      )
    ON CONFLICT (id) DO NOTHING;

    SELECT u.metadata INTO meta FROM users u WHERE u.id = rec.user_id;
    docs := meta->'verification'->'documents';
    docs := jsonb_set(
      docs,
      ARRAY[rec.doc_index::TEXT],
      (docs->rec.doc_index) - 'dataUrl' || jsonb_build_object(
        'file_id', rec.file_id,
        'bucket', rec.bucket,
        'path', rec.path
      )
    );
    meta := jsonb_set(meta, '{verification,documents}', docs);

    -- protect_user_privileged_columns (011) copies verification back from the
    -- stored row when auth.uid() is set. Clear the JWT for this write so the
    -- data URL actually leaves the column. current_user inside this definer
    -- is the function owner, not the end user.
    PERFORM set_config('request.jwt.claim.sub', '', true);
    PERFORM set_config('request.jwt.claims', '', true);
    UPDATE users SET metadata = meta, updated_at = now() WHERE id = rec.user_id;
    migrated := migrated + 1;
  END LOOP;

  RETURN jsonb_build_object('migrated', migrated, 'pending', pending);
END;
$$;

REVOKE ALL ON FUNCTION public.metadata_document_plan() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.migrate_user_metadata_documents() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.metadata_document_plan() TO service_role;
GRANT EXECUTE ON FUNCTION public.migrate_user_metadata_documents() TO service_role;

COMMIT;
