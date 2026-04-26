// Centralised path construction for Supabase Storage objects in the
// `insight-files` bucket. All files live under: {fileType}/{clientId}/...
//
// Keeping the layout in one file means we can rearrange folders later
// without hunting down magic strings, and the RLS policy in
// src/db/migrations/manual_storage_rls.sql assumes exactly this shape.
//
// These helpers are safe to import from both server and client (no env,
// no Supabase client) — you can use them in the browser to preview what
// a future path will look like.

export const BUCKET_NAME = 'insight-files';

/** Every file type that has a dedicated prefix in the bucket. */
export const FILE_TYPES = ['photos', 'documents', 'invoices', 'reports'] as const;
export type FileType = (typeof FILE_TYPES)[number];

export function photoPath(
  clientId: string,
  propertyId: string,
  photoId: string,
  ext: string,
): string {
  return `photos/${clientId}/${propertyId}/${photoId}.${sanitizeExt(ext)}`;
}

export function documentPath(
  clientId: string,
  projectId: string,
  documentId: string,
  originalFilename: string,
): string {
  return `documents/${clientId}/${projectId}/${documentId}_${sanitizeFilename(originalFilename)}`;
}

export function invoicePath(clientId: string, invoiceId: string): string {
  return `invoices/${clientId}/${invoiceId}.pdf`;
}

export function reportPath(clientId: string, reportId: string): string {
  return `reports/${clientId}/${reportId}.pdf`;
}

/**
 * Avatar paths. Two layouts so the existing storage RLS picks up
 * client-readable images without any policy changes:
 *
 * - **Client avatars**: `avatars/{clientId}/avatar.{ext}` — segment 2 is
 *   the clientId, which matches the "Clients read own files" policy
 *   (`(storage.foldername(name))[2] = current_user_client_id()::text`).
 *   So a client viewing the portal can fetch their own avatar via a
 *   signed URL with no extra grant.
 * - **Profile avatars** (admin / staff): `avatars/profile/{userId}.{ext}`
 *   — segment 2 is the literal `profile`, which doesn't match any
 *   client. Admin policy covers admin reads; clients can't see these.
 *
 * Same path is used for upload + read. Re-uploading replaces (upsert).
 */
export function avatarPath(
  entityType: 'profile' | 'client',
  entityId: string,
  ext: string,
): string {
  const safeExt = sanitizeExt(ext) || 'jpg';
  if (entityType === 'client') {
    return `avatars/${entityId}/avatar.${safeExt}`;
  }
  return `avatars/profile/${entityId}.${safeExt}`;
}

/**
 * Path for a vendor document (insurance certificate, W-9, license, etc.).
 * Vendor docs sit in their own top-level prefix because they're admin-only
 * — clients never need to see them, and the path layout keeps them
 * outside the per-client tree the storage RLS uses for client visibility.
 */
export function vendorDocumentPath(
  vendorId: string,
  documentId: string,
  ext: string,
): string {
  return `vendor-documents/${vendorId}/${documentId}.${sanitizeExt(ext) || 'pdf'}`;
}

/**
 * Path for a decision-option thumbnail in a project template.
 *
 * Decision options live outside the per-client hierarchy because templates
 * are global (admin-only). We use a flat namespace with one fresh UUID per
 * upload — this means reordering options, replacing milestone IDs on save,
 * or uploading before the template has been persisted all "just work":
 * the path travels inside the option object, decoupled from any other ID.
 */
export function decisionOptionImagePath(imageId: string, ext: string): string {
  return `decision-options/${imageId}.${sanitizeExt(ext) || 'jpg'}`;
}

/**
 * Sanitise a user-supplied filename for storage. Removes control characters,
 * path separators and non-ASCII-safe characters so we never land something
 * that could confuse the S3-style key parser or leak path traversal.
 * Returns at most 180 characters.
 */
export function sanitizeFilename(name: string): string {
  return name
    .replace(/[\x00-\x1f\x7f]/g, '') // control bytes
    .replace(/[/\\]/g, '_') // path separators
    .replace(/[^a-zA-Z0-9._-]/g, '_') // anything else
    .replace(/_+/g, '_') // collapse runs
    .replace(/^_+|_+$/g, '') // trim
    .slice(0, 180);
}

/** Normalise an extension — lowercase, alphanumeric only, at most 8 chars. */
export function sanitizeExt(ext: string): string {
  return ext.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
}

export interface ParsedStoragePath {
  fileType: FileType;
  clientId: string;
  /** Remaining path segments (e.g. [propertyId, filename] for a photo). */
  rest: string[];
}

/**
 * Parse a storage path back into its components. Returns null if the path
 * doesn't match `{knownFileType}/{anything}/...`.
 */
export function parseStoragePath(path: string): ParsedStoragePath | null {
  const parts = path.split('/').filter(Boolean);
  if (parts.length < 3) return null;

  const [fileType, clientId, ...rest] = parts;
  if (!isFileType(fileType)) return null;

  return { fileType, clientId, rest };
}

function isFileType(value: string): value is FileType {
  return (FILE_TYPES as readonly string[]).includes(value);
}
