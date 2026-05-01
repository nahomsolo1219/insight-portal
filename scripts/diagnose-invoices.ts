// One-off diagnostic for the invoices "No PDF" bug. Bypasses the
// user-cookie auth path that the production code uses (we can't
// authenticate from a CLI) and asks the same questions via the
// service-role admin client:
//
//   1. Pull every invoice for the target client + their storage paths.
//   2. Confirm each path resolves to a real object in the bucket
//      (storage.objects head check).
//   3. Call `createSignedUrls` on the batch and inspect the **raw**
//      response shape from supabase-js — `path`, `signedURL`,
//      `signedUrl`, `error` — so we can see what Supabase echoes.
//
// Run:
//   npx tsx scripts/diagnose-invoices.ts <clientId>
//
// Service-role bypasses RLS, so a failure here points at the API /
// response-shape layer rather than auth. If signing succeeds with the
// service-role client but fails with the cookie-bound client in
// production, the next suspect is the cookie-bound client's user-role
// RLS hitting an unexpected branch.

import './_env';
import { eq } from 'drizzle-orm';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { db } from '@/db';
import { invoices } from '@/db/schema';
import { BUCKET_NAME } from '@/lib/storage/paths';

// `createAdminClient` lives behind `import 'server-only'`, which blocks
// import from a CLI script. Build the same shape here directly.
function makeServiceRoleClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function main() {
  const clientId = process.argv[2];
  if (!clientId) {
    console.error('Usage: npx tsx scripts/diagnose-invoices.ts <clientId>');
    process.exit(1);
  }

  console.log('━━━ invoice diagnostic ━━━');
  console.log('clientId:', clientId);
  console.log('bucket:', BUCKET_NAME);
  console.log();

  const rows = await db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      storagePath: invoices.storagePath,
    })
    .from(invoices)
    .where(eq(invoices.clientId, clientId));

  console.log(`Found ${rows.length} invoice rows for this client.`);
  if (rows.length === 0) {
    console.log('Nothing to sign. Exiting.');
    return;
  }

  for (const r of rows) {
    console.log(`  ${r.invoiceNumber}: storagePath="${r.storagePath}"`);
  }
  console.log();

  const supabase = makeServiceRoleClient();

  // 1. Confirm each object actually exists in storage.
  console.log('━━━ object existence check ━━━');
  for (const r of rows) {
    // `list` with a path filter is the cheapest way to confirm presence
    // without requiring a signed URL or download.
    const folder = r.storagePath.split('/').slice(0, -1).join('/');
    const filename = r.storagePath.split('/').pop() ?? '';
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .list(folder, { search: filename });
    if (error) {
      console.log(`  ${r.invoiceNumber}: list error — ${error.message}`);
      continue;
    }
    const found = data?.some((f) => f.name === filename) ?? false;
    console.log(
      `  ${r.invoiceNumber}: ${found ? '✓ exists' : '✗ NOT FOUND'} at ${r.storagePath}`,
    );
  }
  console.log();

  // 2. Call createSignedUrls and dump the raw response.
  console.log('━━━ createSignedUrls raw response ━━━');
  const paths = rows.map((r) => r.storagePath);
  const { data: signed, error: signError } = await supabase.storage
    .from(BUCKET_NAME)
    .createSignedUrls(paths, 60 * 60);

  if (signError) {
    console.log('createSignedUrls failed:', signError);
    return;
  }
  if (!signed) {
    console.log('createSignedUrls returned null data. Bailing.');
    return;
  }

  console.log(`Response array length: ${signed.length}`);
  console.log();

  signed.forEach((item, i) => {
    const inputPath = paths[i];
    console.log(`  [${i}] input path:           "${inputPath}"`);
    console.log(`      response.path:          ${JSON.stringify(item.path)}`);
    console.log(
      `      response.signedUrl:     ${item.signedUrl ? item.signedUrl.slice(0, 72) + '…' : null}`,
    );
    // The SDK spreads the API response, so `error` may or may not be
    // present depending on the API's success/failure branch.
    const errorField = (item as unknown as Record<string, unknown>).error;
    console.log(`      response.error:         ${JSON.stringify(errorField)}`);
    console.log(
      `      input matches echo?:    ${item.path === inputPath ? 'yes' : `NO (echoed=${JSON.stringify(item.path)})`}`,
    );
    console.log();
  });

  // 3. Build the map both ways so we can see which would have lost rows.
  console.log('━━━ map construction comparison ━━━');
  const oldMap = new Map<string, string>();
  for (const item of signed) {
    if (item.signedUrl && item.path) oldMap.set(item.path, item.signedUrl);
  }
  const newMap = new Map<string, string>();
  signed.forEach((item, i) => {
    const inputPath = paths[i];
    if (inputPath && item.signedUrl) newMap.set(inputPath, item.signedUrl);
  });
  console.log('  OLD helper (key by item.path) size:', oldMap.size);
  console.log('  NEW helper (key by input)    size:', newMap.size);
  console.log();

  // 4. Per-row resolution as the page would compute it.
  console.log('━━━ per-row resolution under both helpers ━━━');
  for (const r of rows) {
    const oldHit = oldMap.get(r.storagePath);
    const newHit = newMap.get(r.storagePath);
    console.log(
      `  ${r.invoiceNumber}: OLD=${oldHit ? '✓' : '— No PDF'}  NEW=${newHit ? '✓' : '— No PDF'}`,
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
