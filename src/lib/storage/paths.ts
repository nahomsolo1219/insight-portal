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
