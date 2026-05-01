// Server-side Supabase Storage helpers. Every function uses the cookie-bound
// server client, so RLS policies on storage.objects decide whether the
// operation succeeds. Server Actions that call these must be gated with
// requireAdmin() / requireUser() upstream; RLS is the second line of defence.

import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient as createServerSupabase } from '@/lib/supabase/server';
import { BUCKET_NAME } from './paths';

export interface UploadInput {
  path: string;
  file: Blob | File | ArrayBuffer | Uint8Array;
  contentType: string;
  /** Overwrite an existing object at `path`. Defaults to false. */
  upsert?: boolean;
}

export type UploadResult = { path: string } | { error: string };

/**
 * Upload a file to the insight-files bucket. Returns either the uploaded
 * path or an error message. Never throws.
 */
export async function uploadFile(input: UploadInput): Promise<UploadResult> {
  const supabase = await createServerSupabase();

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(input.path, input.file, {
      contentType: input.contentType,
      upsert: input.upsert ?? false,
    });

  if (error) {
    console.error('[uploadFile]', error);
    return { error: error.message };
  }

  return { path: data.path };
}

/**
 * Generate a short-lived signed URL for a private object. Use when rendering
 * previews, download links, or <img src> in the browser. Default expiry:
 * 1 hour.
 */
export async function getSignedUrl(path: string, expiresIn = 60 * 60): Promise<string | null> {
  const supabase = await createServerSupabase();

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .createSignedUrl(path, expiresIn);

  if (error || !data) {
    console.error('[getSignedUrl]', error);
    return null;
  }

  return data.signedUrl;
}

/**
 * Batch variant. Signs every requested path in one round-trip and returns
 * a `Map<path, url>` keyed by the **input** path the caller passed in
 * (so `urlMap.get(row.storagePath)` always works).
 *
 * Paths that fail to sign are omitted from the result.
 *
 * Implementation note: supabase-js's `createSignedUrls` returns a
 * response array in the same order as the input. Each item carries a
 * `path` field that is *meant* to echo the input, but in practice that
 * field can be `null` on errored entries and has been observed to drop
 * to null on otherwise-successful entries on certain API versions —
 * which would silently break callers that look up by input path.
 * Pairing input + response by index is the only echo-independent way
 * to build the map; the order guarantee is documented and stable.
 */
export async function getSignedUrls(
  paths: string[],
  expiresIn = 60 * 60,
): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map();

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .createSignedUrls(paths, expiresIn);

  if (error || !data) {
    console.error('[getSignedUrls]', error);
    return new Map();
  }

  const map = new Map<string, string>();
  data.forEach((item, i) => {
    const inputPath = paths[i];
    if (inputPath && item.signedUrl) {
      map.set(inputPath, item.signedUrl);
    }
  });
  return map;
}

// ---------------------------------------------------------------------------
// Admin (service-role) signing variants
// ---------------------------------------------------------------------------
//
// The cookie-bound `getSignedUrl(s)` above runs as the requesting user
// against `storage.objects` RLS. That's the right behaviour for the
// client portal and field surfaces — clients should only get URLs for
// files they own, even if a buggy SQL query somehow surfaces a
// neighbour's path.
//
// On the **admin** side it's a different story: `requireAdmin()` at the
// page / action level is the canonical authorization gate, and the
// cookie-bound storage signing has caused intermittent failures in
// production where the user's JWT didn't propagate through @supabase/ssr
// to the storage REST request — admin pages would render "No PDF" /
// broken images even though the data was healthy.
//
// These admin variants use the service-role client (no RLS), so as long
// as the path string was passed in, signing always succeeds. Use ONLY
// from server-side admin surfaces (admin pages + admin-gated server
// actions). The cookie-bound originals stay untouched for portal/field.

/** Admin variant of `getSignedUrl` — bypasses RLS via the service-role
 *  client. Use only from admin surfaces gated by `requireAdmin()`. */
export async function getSignedUrlAdmin(
  path: string,
  expiresIn = 60 * 60,
): Promise<string | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .createSignedUrl(path, expiresIn);
  if (error || !data) {
    console.error('[getSignedUrlAdmin]', error);
    return null;
  }
  return data.signedUrl;
}

/** Admin variant of `getSignedUrls` — bypasses RLS via the service-role
 *  client. Returns a `Map<inputPath, signedUrl>`; failed entries are
 *  omitted. Use only from admin surfaces gated by `requireAdmin()`. */
export async function getSignedUrlsAdmin(
  paths: string[],
  expiresIn = 60 * 60,
): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map();

  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .createSignedUrls(paths, expiresIn);

  if (error || !data) {
    console.error('[getSignedUrlsAdmin]', error);
    return new Map();
  }

  // Pair input + response by index — the SDK guarantees order is
  // preserved and `item.path` echoes the input cleanly when service-role
  // signs, but keying by input is the helper's documented contract and
  // makes us robust to any future SDK quirks.
  const map = new Map<string, string>();
  data.forEach((item, i) => {
    const inputPath = paths[i];
    if (inputPath && item.signedUrl) {
      map.set(inputPath, item.signedUrl);
    }
  });
  return map;
}

/** Delete a single object from the bucket. Returns true on success. */
export async function deleteFile(path: string): Promise<boolean> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.storage.from(BUCKET_NAME).remove([path]);

  if (error) {
    console.error('[deleteFile]', error);
    return false;
  }
  return true;
}
