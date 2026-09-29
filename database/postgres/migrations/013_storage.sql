-- Private object storage for property media and documents.
-- Apply with: psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f database/postgres/migrations/013_storage.sql
-- This file is not run by `npm run db:migrate` (that script only applies 001).
--
-- Moves file bytes out of Postgres. The SPA uploads into a private bucket, then
-- calls register_file. Reads go through entity_files, which returns signed URLs
-- valid for one hour. ID documents that still sit in users.metadata as data URLs
-- are moved by scripts/migrate-id-documents.ts together with
-- migrate_user_metadata_documents() (see the end of this file).
--
-- Depends on these helpers from database/postgres/migrations/002_supabase_auth.sql.
-- They are not redefined here:
--   auth.uid()
--   public.current_app_user_id()
--   public.current_app_client_id()
--   public.is_agency_staff()
-- Migration 011 (tenant isolation) is being rewritten in parallel and is expected
-- to add agency and party helpers. Those names are not on this branch, so party
-- checks live in public.storage_caller_is_party(). On rebase, point that function
-- at the 011 helper instead of inlining the predicates again.
--
-- Access:
--   * Agency staff (AGENCY_ADMIN, AGENT_ADMIN, GROUND_AGENT) read and upload only
--     inside their own agency.
--   * Tenants and applicants upload only when they are a party on the entity
--     (their application, lease, or maintenance ticket, or their own user row
--     for an ID document) and only under that entity's agency path. They read
--     only files they uploaded.
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
  agency_id     UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
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
-- Path and party checks. SECURITY DEFINER so a tenant who cannot SELECT the
-- ticket row can still be recognised as a party. Each function returns only
-- a boolean or an agency id, and each requires auth.uid() where it decides
-- access.
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
    WHEN 'application' THEN (SELECT client_id FROM applications WHERE id = p_entity_id)
    WHEN 'lease' THEN (SELECT client_id FROM leases WHERE id = p_entity_id)
    WHEN 'ticket' THEN (SELECT client_id FROM maintenance_tickets WHERE id = p_entity_id)
    WHEN 'maintenance_ticket' THEN (SELECT client_id FROM maintenance_tickets WHERE id = p_entity_id)
    WHEN 'user' THEN (SELECT client_id FROM users WHERE id = p_entity_id)
    WHEN 'unit' THEN (SELECT client_id FROM units WHERE id = p_entity_id)
    WHEN 'building' THEN (SELECT client_id FROM buildings WHERE id = p_entity_id)
    ELSE NULL
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
-- Policies run as the current user, so the role needs EXECUTE. The functions
-- return booleans only.
GRANT EXECUTE ON FUNCTION public.storage_upload_authorized(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.storage_object_readable(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.storage_caller_is_party(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.storage_can_delete_unregistered(TEXT, TEXT) TO authenticated;

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
    AND public.storage_upload_authorized(name)
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
-- The file_id is the uuid already in the path. The SPA generates it, uploads
-- with upsert:false, then registers.
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
  existing public.stored_files%ROWTYPE;
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
  BEGIN
    path_agency := folders[1]::UUID;
    path_entity := folders[3]::UUID;
    file_id := split_part(storage.filename(path), '.', 1)::UUID;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Invalid path' USING ERRCODE = '22023';
  END;
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

  SELECT * INTO existing FROM public.stored_files f WHERE f.bucket = register_file.bucket AND f.path = register_file.path;
  IF FOUND THEN
    IF existing.id = file_id
       AND existing.entity_type = register_file.entity_type
       AND existing.entity_id = register_file.entity_id
       AND existing.kind = register_file.kind
       AND existing.uploaded_by = public.current_app_user_id() THEN
      RETURN jsonb_build_object('file_id', existing.id);
    END IF;
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.stored_files (
    id, bucket, path, agency_id, entity_type, entity_id, kind, mime_type, byte_size, uploaded_by
  ) VALUES (
    file_id, bucket, path, entity_agency, entity_type, entity_id, kind, obj_mime, obj_size,
    public.current_app_user_id()
  );
  RETURN jsonb_build_object('file_id', file_id);
END;
$$;

REVOKE ALL ON FUNCTION public.register_file(TEXT, TEXT, TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_file(TEXT, TEXT, TEXT, UUID, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- entity_files({entity_type, entity_id}) -> {files:[{file_id, kind, url, expires_at}]}
-- Signed URLs expire one hour after the call.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.entity_files(
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
  WHERE f.entity_type = entity_files.entity_type
    AND f.entity_id = entity_files.entity_id
    AND (staff OR f.uploaded_by = public.current_app_user_id());

  RETURN jsonb_build_object('files', files);
END;
$$;

REVOKE ALL ON FUNCTION public.entity_files(TEXT, UUID) FROM PUBLIC;
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
-- Users with no client_id, or files outside the documents bucket limits, are
-- left untouched and counted as skipped.
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
           (doc.ordinality - 1)::INTEGER AS idx,
           doc.elem
    FROM (
      SELECT id, client_id, metadata
      FROM users
      WHERE client_id IS NOT NULL
        AND jsonb_typeof(metadata->'verification'->'documents') = 'array'
    ) u
    CROSS JOIN LATERAL jsonb_array_elements(u.metadata->'verification'->'documents')
         WITH ORDINALITY AS doc(elem, ordinality)
    WHERE coalesce(doc.elem->>'dataUrl', '') LIKE 'data:%'
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
      IF bytes IS NOT NULL AND octet_length(bytes) BETWEEN 1 AND 20971520 THEN
        fid := extensions.uuid_generate_v5(
          ns,
          rec.uid::TEXT || '/' || doc_key_text || '/' || md5(raw)
        );
        user_id := rec.uid;
        doc_index := rec.idx;
        doc_key := doc_key_text;
        file_id := fid;
        bucket := 'documents';
        path := rec.client_id::TEXT || '/user/' || rec.uid::TEXT || '/' || fid::TEXT || '.' || ext;
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
      u.client_id,
      'user',
      u.id,
      rec.doc_key,
      rec.mime_type,
      rec.byte_size,
      u.id
    FROM users u
    WHERE u.id = rec.user_id
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
