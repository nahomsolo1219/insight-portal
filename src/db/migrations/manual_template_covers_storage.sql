-- Manual migration (see src/db/migrations/README.md): creates the
-- `template-covers` Supabase Storage bucket + RLS policies on
-- storage.objects for it. Apply with:
--   npx tsx scripts/apply-manual-sql.ts manual_template_covers_storage.sql
--
-- This file is idempotent — `INSERT ... ON CONFLICT` for the bucket and
-- `DROP POLICY IF EXISTS` before each `CREATE POLICY` lets you re-run it
-- safely against an already-configured Supabase project.
--
-- Bucket layout: `template-covers/{templateId}.{ext}` (UUID-based,
-- non-enumerable). Public read so the admin templates listing can fetch
-- without signed URLs; admin-only write. Uploads always overwrite at
-- the same path so we never accumulate stale objects, and the
-- `?v={uploaded_at}` query string at render time invalidates browser
-- caches on replace.
--
-- Admin-only is the right scope here even though the bucket is public:
-- only authenticated admins can upload/replace/delete; the public-read
-- policy just covers SELECTs so signed URLs aren't needed for editorial
-- preview.

-- ---------- Bucket ----------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'template-covers',
  'template-covers',
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
DROP POLICY IF EXISTS "Template covers public read" ON storage.objects;
DROP POLICY IF EXISTS "Admin upload template covers" ON storage.objects;
DROP POLICY IF EXISTS "Admin update template covers" ON storage.objects;
DROP POLICY IF EXISTS "Admin delete template covers" ON storage.objects;

-- Public SELECT — anyone can read covers. URLs are non-enumerable
-- (UUID-based), so this is acceptable; sensitive content goes through
-- the existing private `insight-files` bucket.
CREATE POLICY "Template covers public read"
ON storage.objects FOR SELECT
TO authenticated, anon
USING (bucket_id = 'template-covers');

-- Admin INSERT (initial upload).
CREATE POLICY "Admin upload template covers"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'template-covers'
  AND public.current_user_role() = 'admin'
);

-- Admin UPDATE — needed because the server action uses `upsert: true`
-- to overwrite an existing cover at the same path on replace.
CREATE POLICY "Admin update template covers"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'template-covers'
  AND public.current_user_role() = 'admin'
)
WITH CHECK (
  bucket_id = 'template-covers'
  AND public.current_user_role() = 'admin'
);

-- Admin DELETE — for the "Remove cover" path.
CREATE POLICY "Admin delete template covers"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'template-covers'
  AND public.current_user_role() = 'admin'
);
