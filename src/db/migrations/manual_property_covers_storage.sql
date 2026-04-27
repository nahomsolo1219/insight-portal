-- Manual migration (see src/db/migrations/README.md): creates the
-- `property-covers` Supabase Storage bucket + RLS policies on
-- storage.objects for it. Apply with:
--   npx tsx scripts/apply-manual-sql.ts manual_property_covers_storage.sql
--
-- This file is idempotent — `INSERT ... ON CONFLICT` for the bucket and
-- `DROP POLICY IF EXISTS` before each `CREATE POLICY` lets you re-run it
-- safely against an already-configured Supabase project.
--
-- Bucket layout: `property-covers/{propertyId}.{ext}` (UUID-based,
-- non-enumerable). Public read so clients and field staff can fetch
-- without signed URLs; admin-only write. Uploads always overwrite at
-- the same path so we never accumulate stale objects.

-- ---------- Bucket ----------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'property-covers',
  'property-covers',
  true,
  8388608, -- 8 MiB; matches the server-action validation cap
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ---------- RLS policies on storage.objects --------------------------------

-- Drop existing policies for this bucket so re-application is clean.
DROP POLICY IF EXISTS "Property covers public read" ON storage.objects;
DROP POLICY IF EXISTS "Admin upload property covers" ON storage.objects;
DROP POLICY IF EXISTS "Admin update property covers" ON storage.objects;
DROP POLICY IF EXISTS "Admin delete property covers" ON storage.objects;

-- Public SELECT — anyone (incl. unauthenticated clients fetching the
-- portal) can read covers. The URL is non-enumerable (UUID-based) so
-- this is acceptable; sensitive photos go through the existing
-- `insight-files` bucket which is private.
CREATE POLICY "Property covers public read"
ON storage.objects FOR SELECT
TO authenticated, anon
USING (bucket_id = 'property-covers');

-- Admin INSERT (initial upload).
CREATE POLICY "Admin upload property covers"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'property-covers'
  AND public.current_user_role() = 'admin'
);

-- Admin UPDATE — needed because the server action uses `upsert: true`
-- to overwrite an existing cover at the same path on replace.
CREATE POLICY "Admin update property covers"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'property-covers'
  AND public.current_user_role() = 'admin'
)
WITH CHECK (
  bucket_id = 'property-covers'
  AND public.current_user_role() = 'admin'
);

-- Admin DELETE — for the "Remove cover" path.
CREATE POLICY "Admin delete property covers"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'property-covers'
  AND public.current_user_role() = 'admin'
);
