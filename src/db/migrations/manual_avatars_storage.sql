-- Manual migration (see src/db/migrations/README.md): creates the
-- `avatars` Supabase Storage bucket + RLS policies on storage.objects
-- for it. Apply with:
--   npx tsx scripts/apply-manual-sql.ts manual_avatars_storage.sql
--
-- Idempotent — `INSERT ... ON CONFLICT` on the bucket and
-- `DROP POLICY IF EXISTS` before each `CREATE POLICY` lets you re-run
-- this safely against a Supabase project that's already been
-- configured.
--
-- Bucket layout: `avatars/{userId}/avatar.{ext}` — UUID-pinned
-- folder, single object per user, overwritten on replace so cache
-- busting via `?v={updated_at_ms}` works the same way it does for
-- property and template covers. Public read because the URL is
-- non-enumerable (folder is a UUID); per-user write so a forged
-- request can't drop a file in someone else's folder.

-- ---------- Bucket ----------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  5242880, -- 5 MiB; matches the upload-action validation cap.
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ---------- RLS policies on storage.objects --------------------------------

DROP POLICY IF EXISTS "Avatars public read" ON storage.objects;
DROP POLICY IF EXISTS "Users upload own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users update own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users delete own avatar" ON storage.objects;

-- Public SELECT — anyone (incl. the unauthenticated portal nav and
-- third-party render contexts) can read avatars. The first folder
-- segment is a UUID so the URL space is non-enumerable; sensitive
-- imagery still goes through the private `insight-files` bucket.
CREATE POLICY "Avatars public read"
ON storage.objects FOR SELECT
TO authenticated, anon
USING (bucket_id = 'avatars');

-- Per-user INSERT — the first path segment must equal the caller's
-- `auth.uid()`. Same shape every Supabase tutorial uses for
-- per-user buckets.
CREATE POLICY "Users upload own avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Per-user UPDATE — needed because the upload action uses
-- `upsert: true` to overwrite the existing avatar at the same path
-- on replace.
CREATE POLICY "Users update own avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Per-user DELETE — for a future "Remove avatar" affordance. Not
-- wired in the UI yet but having the policy in place keeps the
-- bucket fully manageable.
CREATE POLICY "Users delete own avatar"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
