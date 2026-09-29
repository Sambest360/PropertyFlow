-- 013 rollback. Drops the private storage contract: sweep job, policies,
-- functions, the file registry, and the property-media / documents buckets.
-- Objects in those buckets are deleted. Bytes already removed from users.metadata
-- are not put back; restore those rows from a backup if you still need the data URLs.
--
-- Apply with: psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f database/postgres/migrations/013_storage_rollback.sql

BEGIN;

DO $$
BEGIN
  PERFORM cron.unschedule('sweep-unregistered-storage');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DROP POLICY IF EXISTS stored_files_select ON public.stored_files;

SET ROLE supabase_storage_admin;
DROP POLICY IF EXISTS property_media_insert ON storage.objects;
DROP POLICY IF EXISTS documents_insert ON storage.objects;
DROP POLICY IF EXISTS stored_objects_select ON storage.objects;
DROP POLICY IF EXISTS stored_objects_delete_unregistered ON storage.objects;
DROP POLICY IF EXISTS property_media_update ON storage.objects;
DROP POLICY IF EXISTS documents_update ON storage.objects;
DROP POLICY IF EXISTS stored_objects_update ON storage.objects;

-- storage.protect_delete blocks catalog deletes unless this is set.
SELECT set_config('storage.allow_delete_query', 'true', true);
DELETE FROM storage.objects WHERE bucket_id IN ('property-media', 'documents');
DELETE FROM storage.buckets WHERE id IN ('property-media', 'documents');
RESET ROLE;

DROP FUNCTION IF EXISTS public.migrate_user_metadata_documents();
DROP FUNCTION IF EXISTS public.metadata_document_plan();
DROP FUNCTION IF EXISTS public.sweep_unregistered_storage();
DROP FUNCTION IF EXISTS public.entity_files(TEXT, UUID);
DROP FUNCTION IF EXISTS public.list_files(TEXT, UUID);
DROP FUNCTION IF EXISTS public.list_files(UUID);
DROP FUNCTION IF EXISTS public.register_file(TEXT, TEXT, TEXT, UUID, TEXT);
DROP FUNCTION IF EXISTS public.storage_signed_url(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.storage_object_readable(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.storage_can_delete_unregistered(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.storage_upload_authorized(TEXT);
DROP FUNCTION IF EXISTS public.storage_user_id_upload_ok(TEXT);
DROP FUNCTION IF EXISTS public.storage_user_id_readable(UUID);
DROP FUNCTION IF EXISTS public.storage_registration_id_owner(TEXT);
DROP FUNCTION IF EXISTS public.storage_caller_is_party(TEXT, UUID);
DROP FUNCTION IF EXISTS public.storage_entity_agency(TEXT, UUID);

DROP TABLE IF EXISTS public.stored_files;

COMMIT;
