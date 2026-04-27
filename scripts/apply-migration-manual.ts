// Manual migration applier — fallback for when `npm run db:migrate`
// trips Supabase's role-level statement_timeout (default 2 min). Runs
// every statement in the file individually with the timeout cleared
// for the session, then records the migration in
// `drizzle.__drizzle_migrations` so the verifier picks it up.
//
// Usage:
//   npm run db:migrate:manual 0007_charming_crusher_hogan.sql
//   npx tsx scripts/apply-migration-manual.ts 0007_charming_crusher_hogan.sql
//
// Idempotent: if the migration is already recorded by hash, the script
// exits successfully without re-running statements. Re-running after a
// partial failure means you'll re-execute already-applied statements —
// some are idempotent (CREATE POLICY IF NOT EXISTS), most aren't.
// Inspect DB state and clean up partial work before retrying.
//
// See `docs/MIGRATIONS.md` for the full SOP.

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import postgres from 'postgres';

config({ path: '.env.local' });

async function main(): Promise<void> {
  const filename = process.argv[2];
  if (!filename) {
    console.error('Usage: npm run db:migrate:manual <filename.sql>');
    process.exit(1);
  }
  if (!filename.endsWith('.sql')) {
    console.error(`Expected a .sql file, got: ${filename}`);
    process.exit(1);
  }

  const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DIRECT_URL;
  if (!url) {
    console.error('apply-migration-manual: set MIGRATION_DATABASE_URL or DIRECT_URL.');
    process.exit(1);
  }

  const path = resolve(process.cwd(), 'src/db/migrations', filename);
  const raw = await readFile(path, 'utf8');
  const hash = createHash('sha256').update(raw).digest('hex');

  // Drop comment-only chunks but keep the SQL of chunks that begin with
  // a comment header (those have a real statement after the header).
  const statements = raw
    .split('--> statement-breakpoint')
    .map((chunk) =>
      chunk
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n')
        .trim(),
    )
    .filter((s) => s.length > 0);

  if (statements.length === 0) {
    console.error(`apply-migration-manual: no executable statements in ${filename}.`);
    process.exit(1);
  }

  console.log(`Applying ${filename}`);
  console.log(`  hash:       ${hash.slice(0, 16)}…`);
  console.log(`  statements: ${statements.length}`);

  const sql = postgres(url, { prepare: false, max: 1 });
  try {
    // Idempotency: if drizzle already has this exact hash recorded, stop
    // here — running again risks half-applying a partially-completed
    // migration.
    const existing = await sql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM drizzle.__drizzle_migrations WHERE hash = ${hash}
    `;
    if (existing[0]?.count && existing[0].count > 0) {
      console.log('Already recorded in drizzle.__drizzle_migrations — skipping.');
      return;
    }

    // Lifting the role's statement_timeout for this session is the whole
    // reason this script exists. Without it, big DDL gets canceled
    // mid-statement and the standard `drizzle-kit migrate` swallows the
    // error.
    await sql.unsafe('SET statement_timeout = 0');

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      const preview = stmt.replace(/\s+/g, ' ').slice(0, 80);
      const label = `[${String(i + 1).padStart(2)}/${statements.length}]`;
      process.stdout.write(`  ${label} ${preview}… `);
      try {
        await sql.unsafe(stmt);
        console.log('ok');
      } catch (err) {
        console.log('FAILED');
        console.error('\nStatement that failed:');
        console.error(stmt);
        console.error('\nError:');
        console.error(err);
        console.error(
          '\nNo automatic rollback. Inspect DB state, clean up partial work, then re-run.',
        );
        process.exit(1);
      }
    }

    // Record the migration so `db:migrate:verify` passes. created_at is
    // milliseconds-since-epoch (drizzle's convention; bigint column).
    await sql`
      INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES (${hash}, ${Date.now()})
      ON CONFLICT DO NOTHING
    `;

    console.log(`\n✓ Recorded ${hash.slice(0, 16)}… in drizzle.__drizzle_migrations.`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error('apply-migration-manual: unexpected failure');
  console.error(err);
  process.exit(1);
});
