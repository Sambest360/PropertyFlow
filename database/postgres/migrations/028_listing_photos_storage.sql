-- 028: listing / ticket photos move out of Postgres into Supabase Storage.
-- Inline base64 data URLs in units.images / buildings.images made every
-- bootstrap ship ~10 MB (21 units + 23 buildings took 0.9–1.2 s per query).
-- Rows now keep the public Storage URL; the bucket is public-read (CDN cached)
-- and only signed-in users can upload. Supabase-hosted only (storage schema).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'listing-photos',
  'listing-photos',
  TRUE,
  5 * 1024 * 1024,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS listing_photos_insert ON storage.objects;
CREATE POLICY listing_photos_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'listing-photos');
