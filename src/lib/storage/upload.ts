// Server-side Supabase Storage helpers. Every function uses the cookie-bound
// server client, so RLS policies on storage.objects decide whether the
// operation succeeds. Server Actions that call these must be gated with
// requireAdmin() / requireUser() upstream; RLS is the second line of defence.

import 'server-only';

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
 * a `Map<path, url>`. Paths that fail to sign are omitted from the result.
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
  for (const item of data) {
    if (item.signedUrl && item.path) {
      map.set(item.path, item.signedUrl);
    }
  }
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
