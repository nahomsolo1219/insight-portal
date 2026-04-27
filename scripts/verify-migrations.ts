// Post-migration safety net.
//
// Reads `src/db/migrations/meta/_journal.json` (drizzle's local list of
// generated migrations), computes the SHA-256 of each corresponding
// `.sql` file, and confirms every hash is present in the live DB's
// `drizzle.__drizzle_migrations` table.
//
// Why we bother: `drizzle-kit migrate` has been observed to exit zero
// while silently NOT applying — Supabase enforces a 2-minute role-level
// `statement_timeout`, and big DDL that trips it can be swallowed by
// drizzle-kit's error handling. See `docs/MIGRATIONS.md` for the
// incident writeup. This script is the load-bearing check that catches
// the silent-fail case the next time it happens.
//
// Hash algorithm matches drizzle-orm's pg dialect: SHA-256 over the
// file content as-read, hex-encoded. Verified against eight live
// migrations on 2026-04-27.

import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import postgres from 'postgres';

config({ path: '.env.local' });

interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints?: boolean;
}

interface Journal {
  version: string;
  dialect: string;
  entries: JournalEntry[];
}

const MIGRATIONS_DIR = resolve(process.cwd(), 'src/db/migrations');
const JOURNAL_PATH = resolve(MIGRATIONS_DIR, 'meta/_journal.json');

async function main(): Promise<void> {
  const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DIRECT_URL;
  if (!url) {
    console.error('verify-migrations: set MIGRATION_DATABASE_URL or DIRECT_URL in .env.local.');
    process.exit(1);
  }

  // 1. Local journal — what we expect to be applied.
  const journalRaw = await readFile(JOURNAL_PATH, 'utf8');
  const journal = JSON.parse(journalRaw) as Journal;
  if (!journal.entries?.length) {
    console.log('verify-migrations: no entries in local journal — nothing to check.');
    return;
  }

  // 2. Compute the expected hash for each migration. Drizzle's pg dialect
  //    stores SHA-256 of the raw .sql file content, hex-encoded.
  const expected = await Promise.all(
    journal.entries.map(async (entry) => {
      const path = resolve(MIGRATIONS_DIR, `${entry.tag}.sql`);
      const content = await readFile(path, 'utf8');
      const hash = createHash('sha256').update(content).digest('hex');
      return { tag: entry.tag, idx: entry.idx, hash };
    }),
  );

  // 3. Live DB — what's actually applied.
  const sql = postgres(url, { prepare: false, max: 1 });
  let applied: { hash: string; created_at: bigint }[];
  try {
    applied = await sql<{ hash: string; created_at: bigint }[]>`
      SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at
    `;
  } catch (err) {
    await sql.end();
    if ((err as { code?: string }).code === '42P01') {
      // Table doesn't exist — drizzle-kit migrate has never run.
      console.error(
        'verify-migrations: drizzle.__drizzle_migrations not found. Has drizzle-kit migrate ever run on this database?',
      );
      process.exit(1);
    }
    throw err;
  }
  await sql.end();

  const appliedSet = new Set(applied.map((r) => r.hash));

  // 4. Compare. Missing = applied to local journal but not to DB → silent
  //    failure of the migrate step. Extras (applied but not in journal)
  //    are warnings only — common when checking out a feature branch
  //    that's behind another's migrations.
  const missing = expected.filter((e) => !appliedSet.has(e.hash));
  const expectedHashes = new Set(expected.map((e) => e.hash));
  const extras = applied.filter((r) => !expectedHashes.has(r.hash));

  if (missing.length > 0) {
    console.error(
      `\n✗ verify-migrations: ${missing.length} migration(s) in the local journal are NOT applied to the database:`,
    );
    for (const m of missing) {
      console.error(`  - ${m.tag}  (sha256: ${m.hash.slice(0, 16)}…)`);
    }
    console.error(
      '\nLikely cause: drizzle-kit migrate exited 0 but silently skipped the migration (Supabase statement_timeout).',
    );
    console.error(
      'Fix:\n  1. Check pg_stat_activity for stuck backends; pg_terminate_backend if any.\n  2. Apply manually:  npm run db:migrate:manual <filename>\n  3. Re-run:           npm run db:migrate:verify',
    );
    process.exit(1);
  }

  const summary = `✓ ${expected.length} migration${expected.length === 1 ? '' : 's'} verified`;
  if (extras.length > 0) {
    console.log(
      `${summary} (${extras.length} applied row${extras.length === 1 ? '' : 's'} not in local journal — likely a sibling branch)`,
    );
  } else {
    console.log(summary);
  }
}

main().catch((err) => {
  console.error('verify-migrations: unexpected failure');
  console.error(err);
  process.exit(1);
});
