// End-to-end storage smoke test. Uploads a tiny file as the service role
// (which bypasses RLS), fetches a signed URL for it, verifies the signed URL
// resolves to the expected bytes, and deletes the file on the way out.
//
// Usage: npx tsx scripts/test-storage.ts
//
// This talks to Supabase directly via @supabase/supabase-js rather than the
// app's server client — we have no auth session from a script.

import './_env';

import { createClient } from '@supabase/supabase-js';
import { BUCKET_NAME, documentPath } from '../src/lib/storage/paths';
import { sanitizeFilename } from '../src/lib/storage/paths';

const BODY = `smoke test at ${new Date().toISOString()}`;
const TEST_CLIENT_ID = 'test-client-0000';
const TEST_PROJECT_ID = 'test-project-0000';
const TEST_DOC_ID = `smoke-${Date.now()}`;

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const path = documentPath(TEST_CLIENT_ID, TEST_PROJECT_ID, TEST_DOC_ID, 'smoke-test.txt');
  console.log(`Target path: ${path}`);
  // Verify sanitizeFilename wires through documentPath.
  console.log(`sanitizeFilename('hello world!.pdf') → ${sanitizeFilename('hello world!.pdf')}`);

  // 1. Upload
  const uploadRes = await supabase.storage
    .from(BUCKET_NAME)
    .upload(path, new Blob([BODY], { type: 'text/plain' }), {
      contentType: 'text/plain',
      upsert: true,
    });
  if (uploadRes.error) throw new Error(`upload: ${uploadRes.error.message}`);
  console.log(`[✓] Uploaded (${BODY.length} bytes)`);

  // 2. Sign a short-lived URL
  const signRes = await supabase.storage.from(BUCKET_NAME).createSignedUrl(path, 60);
  if (signRes.error || !signRes.data) throw new Error(`sign: ${signRes.error?.message}`);
  console.log(`[✓] Signed URL (60s): ${signRes.data.signedUrl.slice(0, 80)}...`);

  // 3. Fetch the signed URL and verify round-trip
  const fetched = await fetch(signRes.data.signedUrl);
  if (!fetched.ok) throw new Error(`fetch signed URL: HTTP ${fetched.status}`);
  const body = await fetched.text();
  if (body !== BODY) {
    throw new Error(`round-trip mismatch: got "${body.slice(0, 60)}", expected "${BODY}"`);
  }
  console.log(`[✓] Fetched + verified round-trip`);

  // 4. Batch signing
  const batchRes = await supabase.storage.from(BUCKET_NAME).createSignedUrls([path], 60);
  if (batchRes.error || !batchRes.data) throw new Error(`batch sign: ${batchRes.error?.message}`);
  console.log(`[✓] Batch signed ${batchRes.data.length} URL(s)`);

  // 5. Delete
  const deleteRes = await supabase.storage.from(BUCKET_NAME).remove([path]);
  if (deleteRes.error) throw new Error(`delete: ${deleteRes.error.message}`);
  console.log(`[✓] Deleted`);

  // 6. Confirm deletion — a second sign should still work (signed URLs don't
  //    check object existence at sign time), but the GET through it should
  //    404. That's acceptable; we just re-list the prefix and expect empty.
  const listRes = await supabase.storage
    .from(BUCKET_NAME)
    .list(`documents/${TEST_CLIENT_ID}/${TEST_PROJECT_ID}`, { limit: 10 });
  if (listRes.error) throw new Error(`list: ${listRes.error.message}`);
  const stillThere = listRes.data.find((f) => path.endsWith(f.name));
  if (stillThere) throw new Error(`object still present after delete: ${stillThere.name}`);
  console.log(`[✓] Prefix is clean post-delete`);

  console.log('\nAll checks passed.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n[✗] Smoke test failed:', err);
    process.exit(1);
  });
