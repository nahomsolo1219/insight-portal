// Applies a single SQL file from src/db/migrations/ using the DIRECT_URL
// connection. Use this only for files that drizzle-kit can't track — e.g.
// triggers on the auth schema. Those files live alongside drizzle's
// numbered migrations but are prefixed `manual_`.
//
// Usage:
//   npx tsx scripts/apply-manual-sql.ts manual_profile_trigger.sql

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import postgres from 'postgres';

config({ path: '.env.local' });

async function main() {
  const filename = process.argv[2];
  if (!filename) {
    console.error('Usage: npx tsx scripts/apply-manual-sql.ts <filename>');
    process.exit(1);
  }

  const path = resolve(process.cwd(), 'src/db/migrations', filename);
  const sql = await readFile(path, 'utf8');

  console.log(`Applying ${filename} via DIRECT_URL...`);

  const client = postgres(process.env.DIRECT_URL!, { prepare: false });
  try {
    await client.unsafe(sql);
    console.log('[✓] Applied successfully.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
