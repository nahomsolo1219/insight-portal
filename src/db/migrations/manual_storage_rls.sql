-- Manual migration (see src/db/migrations/README.md): touches the
-- `storage` schema, which drizzle-kit can't manage. Apply with:
--   npx tsx scripts/apply-manual-sql.ts manual_storage_rls.sql
--
-- RLS for the `insight-files` bucket. Path layout is:
--   {fileType}/{clientId}/...
-- where fileType ∈ ('photos', 'documents', 'invoices', 'reports').
--
-- storage.foldername(name) returns the path split into segments, so
--   [1] = fileType
--   [2] = clientId
--   [3..] = rest of the path
--
-- current_user_role() and current_user_client_id() are the SECURITY
-- DEFINER helpers installed with the base migration (0000_...).

-- Idempotent re-application: drop policies with the same name first so this
-- file can be re-run safely against a Supabase project that's already had it
-- applied. (Policy names are per-table, so the ON clause is required.)
DROP POLICY IF EXISTS "Admin full storage access" ON storage.objects;
DROP POLICY IF EXISTS "Clients read own files" ON storage.objects;
DROP POLICY IF EXISTS "Field staff upload photos" ON storage.objects;
DROP POLICY IF EXISTS "Field staff read own uploads" ON storage.objects;

-- Admin: unrestricted read + write on every insight-files object.
CREATE POLICY "Admin full storage access"
ON storage.objects FOR ALL
TO authenticated
USING (
  bucket_id = 'insight-files'
  AND public.current_user_role() = 'admin'
)
WITH CHECK (
  bucket_id = 'insight-files'
  AND public.current_user_role() = 'admin'
);

-- Client: read files under their own {fileType}/{clientId}/ prefix only,
-- with one exception — uncategorized photos (photos.status = 'pending')
-- are admin-only until they've been reviewed and tagged.
CREATE POLICY "Clients read own files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'insight-files'
  AND public.current_user_role() = 'client'
  AND (storage.foldername(name))[2] = public.current_user_client_id()::text
  AND NOT (
    (storage.foldername(name))[1] = 'photos'
    AND EXISTS (
      SELECT 1 FROM public.photos p
      WHERE p.storage_path = name
      AND p.status = 'pending'
    )
  )
);

-- Field staff: may INSERT into the photos/ prefix only. Never anywhere else.
CREATE POLICY "Field staff upload photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'insight-files'
  AND public.current_user_role() = 'field_staff'
  AND (storage.foldername(name))[1] = 'photos'
);

-- Field staff: SELECT only objects they uploaded themselves (storage.objects
-- sets `owner` to auth.uid() on INSERT). No cross-staff visibility.
CREATE POLICY "Field staff read own uploads"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'insight-files'
  AND public.current_user_role() = 'field_staff'
  AND owner = auth.uid()
);
