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

  // ──────────────────────────────────────────────────────────────────
  // TEMP DIAGNOSTIC (remove after diagnosis): dump the raw response
  // shape from supabase-js so we can see whether the cookie-bound
  // (user-session) client is hitting an RLS denial, returning empty
  // data, or echoing back a different `path` shape than the input.
  // ──────────────────────────────────────────────────────────────────
  console.log('[getSignedUrls/diag] inputs:', paths);
  console.log('[getSignedUrls/diag] supabase error:', error);
  if (data) {
    console.log(
      '[getSignedUrls/diag] response items:',
      data.map((item, i) => {
        const errField = (item as unknown as Record<string, unknown>).error;
        return {
          inputPath: paths[i],
          responsePath: item.path,
          signedUrlPresent: Boolean(item.signedUrl),
          signedUrlPrefix: item.signedUrl ? item.signedUrl.slice(0, 80) + '…' : null,
          errorField: errField ?? null,
          inputMatchesEcho: item.path === paths[i],
        };
      }),
    );
  } else {
    console.log('[getSignedUrls/diag] response data: null/undefined');
  }

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
