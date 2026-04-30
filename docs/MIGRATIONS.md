# Database migrations — SOP

The standard workflow is two commands. This doc exists because we hit
a silent-fail mode that took an hour to recover from; the scaffolding
(separate migration URL, post-migration verifier, manual-apply
fallback) is here to make sure that doesn't happen again.

---

## Standard workflow

```bash
# 1. Edit src/db/schema.ts. Then generate the SQL.
npm run db:generate

# 2. Open src/db/migrations/<NNNN>_<name>.sql and review it. Make sure:
#    - It does what you expected.
#    - drizzle-kit didn't emit any CREATE TABLE "auth"."users" block
#      (that schema is owned by Supabase Auth — strip it if you see it).
#    - For destructive enum / column changes, the data migration is
#      sequenced correctly (cast to text, UPDATE values, recreate
#      type, cast back).

# 3. Apply + verify in one step.
npm run db:migrate
```

`npm run db:migrate` runs `drizzle-kit migrate` and then immediately
runs `scripts/verify-migrations.ts`, which hashes every local
migration file and confirms it's recorded in
`drizzle.__drizzle_migrations`. If drizzle-kit silently no-oped (see
the [October 2026 incident](#october-2026-incident) below), the
verifier exits non-zero on the same command and tells you what to do.

To re-verify without re-running migrations:

```bash
npm run db:migrate:verify
```

---

## Connection setup

Three Postgres URLs, three roles:

| Var | Port | Pooler mode | Used by |
|---|---|---|---|
| `DATABASE_URL` | 6543 | Transaction (pgbouncer-style) | The runtime Next.js app via Drizzle. Keep the role's default 2-minute `statement_timeout` — it's a real safety against runaway queries. |
| `DIRECT_URL` | 5432 | Session (supavisor session mode) | drizzle-kit migrations and `scripts/*.ts` helpers. Default fallback for the migration tools. |
| `MIGRATION_DATABASE_URL` | (your call) | Should be a non-pooled connection if you can | Optional. When set, drizzle-kit and the helper scripts use this instead of `DIRECT_URL`. |

`MIGRATION_DATABASE_URL` exists so you can override the runtime
connection for migrations specifically — e.g. point it at a true
direct connection (`db.PROJECT_REF.supabase.co:5432`) and append a
`statement_timeout` override:

```
postgresql://postgres:PASSWORD@db.PROJECT_REF.supabase.co:5432/postgres?options=-c%20statement_timeout%3D0
```

That URL-encoded `options` string is the Postgres-standard way to
push a startup parameter — it's equivalent to `-c statement_timeout=0`.

### Supabase pooler caveat

**As of 2026-04, the `*.pooler.supabase.com` endpoint silently drops
the `options` startup parameter.** A connection to the pooler with
`?options=-c%20statement_timeout%3D0` still inherits the role-level
2-minute timeout. We verified this on this project. So:

- Pointing `MIGRATION_DATABASE_URL` at the pooler with the suffix is
  harmless but won't actually disable the timeout.
- For migrations that exceed 2 minutes via the pooler, use the
  manual-apply script (next section), which sets `statement_timeout = 0`
  via `SET` after connecting — that DOES work.
- If you have access to the truly-direct
  `db.<project_ref>.supabase.co:5432` endpoint, point
  `MIGRATION_DATABASE_URL` there instead — startup parameters are
  honoured on the direct connection.

### What to set in each environment

| Environment | `DATABASE_URL` | `DIRECT_URL` | `MIGRATION_DATABASE_URL` |
|---|---|---|---|
| Local (`.env.local`) | required | required | optional, see [.env.example](../.env.example) |
| Vercel | required (any deployment that runs the app) | not needed | not needed (migrations run from a developer's machine, not from Vercel) |
| GitHub Actions, if you ever add a CI migration step | not needed | required | required if you want CI to bypass the 2-minute timeout |

The Vercel deployments don't run migrations — they just run the
built app. Set only `DATABASE_URL` (plus the Supabase keys + site
URL) in Vercel.

---

## What to do if a migration fails

### Symptom: "verify-migrations: N migration(s) … are NOT applied"

The verifier ran after `drizzle-kit migrate` and caught a missing
hash. This usually means drizzle-kit hit the statement timeout and
swallowed the error.

1. **Check for stuck backends** holding locks:
   ```sql
   SELECT pid, state, query_start, query
   FROM pg_stat_activity
   WHERE state IN ('active', 'idle in transaction')
     AND pid <> pg_backend_pid()
     AND query NOT LIKE '%pg_stat_activity%';
   ```
   Anything from your IP that's been hanging since the failed migrate
   is a stale connection. Terminate:
   ```sql
   SELECT pg_terminate_backend(<pid>);
   ```

2. **Inspect partial state.** A failed migration may have applied
   *some* of its statements before being cancelled. Look at the
   migration SQL and check whether columns / tables / types it adds
   are present (`\d <table>` in psql, or
   `SELECT column_name FROM information_schema.columns WHERE table_name = ...`).
   If anything partially applied, decide whether to:
   - hand-clean the partial state and re-run via `db:migrate:manual`, or
   - hand-write a one-off cleanup SQL that the next migration absorbs.

3. **Apply manually via the helper:**
   ```bash
   npm run db:migrate:manual 0007_charming_crusher_hogan.sql
   ```
   This script: connects directly, sets `statement_timeout = 0`,
   splits on `--> statement-breakpoint`, and runs each statement
   with progress logging. On success, it inserts the migration row
   into `drizzle.__drizzle_migrations` so the verifier accepts it.

4. **Re-verify:**
   ```bash
   npm run db:migrate:verify
   ```

### Symptom: drizzle-kit migrate exits with a real error

Standard troubleshooting — read the SQL, fix the issue, regenerate
or hand-edit the migration, retry. Nothing migration-specific.

### Symptom: "applied row not in local journal" warning

The DB has migration hashes that aren't in `_journal.json`. Most
likely cause: someone else applied a migration on a different
branch and you're behind. Pull main, regenerate, re-verify.

---

## Manual schema changes (the `auth` and `storage` schemas)

drizzle-kit can't manage the `auth` and `storage` schemas (Supabase
owns them). Files prefixed `manual_` in `src/db/migrations/` are
applied out of band:

```bash
npx tsx scripts/apply-manual-sql.ts manual_profile_trigger.sql
```

These don't go in the drizzle journal. The verifier ignores them.
See `src/db/migrations/README.md` for the current list.

---

## Storage bucket setup

Two buckets currently exist on this project:

### `insight-files` (private)

Originally created via the Supabase Dashboard. Holds photos,
documents, invoices, reports, vendor docs, decision-option
images, avatars, and `temp-downloads/` for ZIP exports.
Path scheme is `{fileType}/{clientId}/...`. RLS policies live in
`src/db/migrations/manual_storage_rls.sql`.

If you ever need to recreate this from scratch on a fresh Supabase
project:

1. Open Supabase Dashboard → Storage → New bucket.
2. Name: `insight-files`. Public: **off**.
3. File size limit: 25 MB (matches `next.config.ts` body limit).
4. Allowed MIME types: leave open (`image/*`, `application/pdf`,
   `text/*` — vendor docs include various types).
5. Apply the policies:
   ```bash
   npx tsx scripts/apply-manual-sql.ts manual_storage_rls.sql
   ```

### `property-covers` (public)

Used by Phase 1 onward of the client portal redesign. Each
property's optional editorial cover photo lives at
`property-covers/{propertyId}.{ext}` — UUID-based, non-enumerable,
overwritten on replace so cache busting via the
`?v={uploaded_at}` query string just works.

Setup (idempotent — re-running is safe):

```bash
npx tsx scripts/apply-manual-sql.ts manual_property_covers_storage.sql
```

That single file does both the bucket creation
(`INSERT INTO storage.buckets ... ON CONFLICT DO UPDATE`) and the
RLS policies on `storage.objects`. The bucket is **public read**
because the URL is non-enumerable and editorial covers aren't
sensitive; **admin write only** so clients and field staff can't
upload through this surface.

Policy SQL applied (also visible in the manual file):

```sql
-- public SELECT
CREATE POLICY "Property covers public read"
ON storage.objects FOR SELECT TO authenticated, anon
USING (bucket_id = 'property-covers');

-- admin INSERT / UPDATE / DELETE
CREATE POLICY "Admin upload property covers"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'property-covers'
  AND public.current_user_role() = 'admin'
);
-- ... matching UPDATE + DELETE policies — see the manual file.
```

To verify the bucket landed: connect via `DIRECT_URL` and run
`SELECT id, public FROM storage.buckets;` — should list both
`insight-files` (public=false) and `property-covers` (public=true).

### `template-covers` (public)

Used by the admin templates listing surface. Each project template's
optional editorial cover photo lives at
`template-covers/{templateId}.{ext}` — UUID-based, non-enumerable,
overwritten on replace so cache busting via the
`?v={uploaded_at}` query string works the same way it does for
property covers.

Setup (idempotent — re-running is safe):

```bash
npx tsx scripts/apply-manual-sql.ts manual_template_covers_storage.sql
```

Same shape as `property-covers`: bucket creation with
`INSERT ... ON CONFLICT DO UPDATE` plus four RLS policies on
`storage.objects` (public SELECT, admin INSERT / UPDATE / DELETE).
8 MiB file-size cap, JPEG / PNG / WebP / HEIC / HEIF MIME allow-list.

The bucket is **public read** because the URL is non-enumerable and
editorial covers aren't sensitive; **admin write only** so non-admin
roles can't upload through this surface.

To verify the bucket landed: `SELECT id, public FROM storage.buckets;`
— should now also list `template-covers` (public=true).

---

## October 2026 incident

What happened:

- Migration `0007_charming_crusher_hogan.sql` collapsed the
  `staff_role` enum (drop two values, recreate the type, recast the
  column) plus added a new table and several RLS policies — 17
  statements total.
- `npx drizzle-kit migrate` exited 0 with no output. The local
  journal had `0007` but the DB had no record of it.
- Three orphaned postgres backends were holding `AccessExclusiveLock`
  on `staff` because the connection was killed mid-transaction;
  every retry blocked on those locks.

Root cause: Supabase's role-level `statement_timeout` is 2 minutes,
the column-recast statement scanned more than it could finish in
that window (network latency to Supabase from a residential
connection added overhead), and drizzle-kit's pg dialect swallowed
the `canceling statement due to statement timeout` error and
continued returning success.

Recovery took about an hour:

1. Identified the stuck backends via `pg_stat_activity`.
2. `pg_terminate_backend()` on each.
3. Wrote a one-off applier script that ran each statement
   individually with `SET statement_timeout = 0` and inserted into
   `drizzle.__drizzle_migrations` manually.

Outputs of that incident, now permanent:

- `MIGRATION_DATABASE_URL` env var (lets you point migrations at a
  non-pooled connection in the future).
- `scripts/verify-migrations.ts` (catches silent failure on the next
  migration that trips the timeout).
- `scripts/apply-migration-manual.ts` (the throwaway script,
  productionised so we don't reinvent it next time).
- This doc.

The verifier is the load-bearing piece: even if everything else
ages badly, that script will exit non-zero the moment the DB and
the journal disagree.
