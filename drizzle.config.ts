import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

config({ path: '.env.local' });

// `MIGRATION_DATABASE_URL` is preferred when set — it's the right place to
// point at a non-pooled connection and append `?options=-c%20statement_timeout%3D0`
// so big DDL doesn't trip Supabase's role-level 2-minute statement timeout.
// Falls back to `DIRECT_URL` (session-pooler at port 5432) so local dev works
// without any extra configuration. See `docs/MIGRATIONS.md` for the full
// rationale + a Supabase-pooler caveat that means the URL `options` param
// is silently ignored on the current setup; the post-migration verifier is
// the real safety net.
const migrationUrl = process.env.MIGRATION_DATABASE_URL ?? process.env.DIRECT_URL;
if (!migrationUrl) {
  throw new Error(
    'Set MIGRATION_DATABASE_URL or DIRECT_URL in .env.local before running drizzle-kit.',
  );
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: migrationUrl,
  },
  verbose: true,
  strict: true,
});
