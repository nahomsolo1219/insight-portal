// End-to-end verification for the Documents tab's write paths against the
// real bucket + DB. We can't call the Server Action directly (no auth
// session), so we mirror its SQL + storage calls with the service-role
// client. Everything we create is reverted on the way out.

import './_env';

import { createClient } from '@supabase/supabase-js';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../src/db';
import { documents, projects } from '../src/db/schema';
import { getDocumentsForProperty, getProjectsForPropertySelect } from '../src/app/admin/clients/[id]/queries';
import { BUCKET_NAME, documentPath } from '../src/lib/storage/paths';

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const storage = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  }).storage;

  // --- Fixture: Andersons + Kitchen Remodel ---
  const andersons = await db.query.clients.findFirst({
    where: (c, { eq }) => eq(c.name, 'The Andersons'),
  });
  if (!andersons) throw new Error('Andersons not seeded — run `npm run db:seed`');
  const kitchen = await db.query.projects.findFirst({
    where: (p, { eq }) => eq(p.name, 'Kitchen Remodel'),
  });
  if (!kitchen) throw new Error('Kitchen Remodel project not seeded');

  // --- Baseline queries ---
  const beforeCount = (await getDocumentsForProperty(kitchen.propertyId)).length;
  const projectOptions = await getProjectsForPropertySelect(kitchen.propertyId);
  console.log(
    `Baseline:\n  documents on property = ${beforeCount}\n  project options      = ${projectOptions.length} (${projectOptions.map((p) => p.name).join(', ')})`,
  );

  // --- Upload two test files, mirroring uploadDocuments ---
  const testDocs: { id: string; name: string; path: string }[] = [];
  for (const filename of ['verify-contract.pdf', 'verify-drawing.pdf']) {
    const docId = crypto.randomUUID();
    const path = documentPath(andersons.id, kitchen.id, docId, filename);
    const body = `verify-documents script — ${filename} — ${new Date().toISOString()}`;

    const uploadRes = await storage
      .from(BUCKET_NAME)
      .upload(path, new Blob([body], { type: 'application/pdf' }), {
        contentType: 'application/pdf',
        upsert: false,
      });
    if (uploadRes.error) throw new Error(`storage upload: ${uploadRes.error.message}`);

    await db.insert(documents).values({
      id: docId,
      projectId: kitchen.id,
      name: filename,
      date: new Date().toISOString().slice(0, 10),
      type: 'contract',
      storagePath: path,
    });

    testDocs.push({ id: docId, name: filename, path });
  }
  console.log(`\n[✓] Uploaded + inserted ${testDocs.length} test docs`);

  // --- Re-read via the query layer to make sure they surface ---
  const after = await getDocumentsForProperty(kitchen.propertyId);
  const newOnes = after.filter((d) => testDocs.some((t) => t.id === d.id));
  console.log(
    `\nPost-upload query returned ${after.length} docs (delta = ${after.length - beforeCount}). New rows:`,
  );
  for (const d of newOnes) {
    console.log(`  - ${d.name.padEnd(24)} type=${d.type.padEnd(10)} project="${d.projectName}" storagePath=${d.storagePath}`);
  }

  // --- Batch-sign and fetch one back to prove the signed URL works ---
  const signRes = await storage
    .from(BUCKET_NAME)
    .createSignedUrls(
      testDocs.map((d) => d.path),
      60,
    );
  if (signRes.error || !signRes.data) throw new Error(`sign: ${signRes.error?.message}`);
  const first = signRes.data[0];
  if (!first?.signedUrl) throw new Error('no signed URL for first doc');
  const fetched = await fetch(first.signedUrl);
  if (!fetched.ok) throw new Error(`fetch signed URL: HTTP ${fetched.status}`);
  console.log(`\n[✓] Batch-signed ${signRes.data.length} URLs; fetched first one (HTTP ${fetched.status})`);

  // --- Delete DB rows + storage objects (mirrors deleteDocument) ---
  await db.delete(documents).where(inArray(documents.id, testDocs.map((d) => d.id)));
  const removeRes = await storage.from(BUCKET_NAME).remove(testDocs.map((d) => d.path));
  if (removeRes.error) throw new Error(`storage remove: ${removeRes.error.message}`);
  console.log(`\n[✓] Deleted ${testDocs.length} DB rows + storage objects`);

  // --- Confirm counts landed back at baseline ---
  const finalCount = (await getDocumentsForProperty(kitchen.propertyId)).length;
  if (finalCount !== beforeCount) {
    throw new Error(`document count drift: expected ${beforeCount}, got ${finalCount}`);
  }
  console.log(`\n[✓] Count returned to baseline (${finalCount}). No orphans.`);

  // Sanity: prefix should no longer list our files.
  const list = await storage
    .from(BUCKET_NAME)
    .list(`documents/${andersons.id}/${kitchen.id}`, { limit: 100 });
  if (list.error) throw new Error(`list: ${list.error.message}`);
  const lingering = list.data.filter((f) => testDocs.some((t) => t.path.endsWith(f.name)));
  if (lingering.length > 0) {
    throw new Error(`orphan storage objects: ${lingering.map((f) => f.name).join(', ')}`);
  }
  console.log(`[✓] Bucket prefix clean`);

  // Quick touch: the projects.name we stored on the join should render nicely.
  console.log(`\nproject picker first option: ${projectOptions[0]?.name ?? 'none'} [${projectOptions[0]?.type}]`);

  // Silence unused-import lint for `projects` + `eq` if none ran (both are used above).
  void projects;
  void eq;
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n[✗] Documents verification failed:', err);
    process.exit(1);
  });
