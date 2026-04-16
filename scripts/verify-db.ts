// One-off verification script. Run with: npx tsx scripts/verify-db.ts
//
// Connects to Supabase via DIRECT_URL and prints a summary of what landed
// in the public schema after the migration. Safe to delete once we're past
// the database-foundation phase.

import { config } from 'dotenv';
import postgres from 'postgres';

config({ path: '.env.local' });

const sql = postgres(process.env.DIRECT_URL!, { prepare: false });

async function main() {
  const tables = await sql<{ tablename: string; rowsecurity: boolean }[]>`
    SELECT tablename, rowsecurity
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `;

  const policies = await sql<{ tablename: string; policyname: string; cmd: string }[]>`
    SELECT tablename, policyname, cmd
    FROM pg_policies
    WHERE schemaname = 'public'
    ORDER BY tablename, policyname
  `;

  const enums = await sql<{ typname: string; values: string[] }[]>`
    SELECT t.typname, array_agg(e.enumlabel ORDER BY e.enumsortorder) AS values
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
    GROUP BY t.typname
    ORDER BY t.typname
  `;

  const helpers = await sql<{ proname: string }[]>`
    SELECT proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND proname IN ('current_user_role', 'current_user_client_id')
    ORDER BY proname
  `;

  console.log(`\nTables in public schema (${tables.length}):`);
  for (const t of tables) {
    console.log(`  ${t.rowsecurity ? '[RLS]' : '[   ]'} ${t.tablename}`);
  }

  const tablesWithoutRls = tables.filter((t) => !t.rowsecurity).map((t) => t.tablename);
  if (tablesWithoutRls.length > 0) {
    console.log(`\nWARNING — ${tablesWithoutRls.length} table(s) without RLS:`);
    for (const name of tablesWithoutRls) console.log(`  ${name}`);
  }

  const policyCounts = new Map<string, number>();
  for (const p of policies) {
    policyCounts.set(p.tablename, (policyCounts.get(p.tablename) ?? 0) + 1);
  }
  console.log(`\nPolicies per table:`);
  for (const t of tables) {
    console.log(`  ${(policyCounts.get(t.tablename) ?? 0).toString().padStart(2)}  ${t.tablename}`);
  }
  console.log(`  TOTAL: ${policies.length}`);

  console.log(`\nEnums (${enums.length}):`);
  for (const e of enums) {
    console.log(`  ${e.typname}  →  ${e.values.join(', ')}`);
  }

  console.log(`\nHelper functions (${helpers.length}):`);
  for (const h of helpers) console.log(`  ${h.proname}()`);

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
