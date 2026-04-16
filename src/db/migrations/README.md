# Migrations

Drizzle-kit owns the numbered `*.sql` files here **except** where noted below.
`npx drizzle-kit migrate` applies every numbered file in order.

## Manually-applied migrations

drizzle-kit cannot manage objects in the `auth` schema because that schema is
owned by Supabase Auth. The migrations listed here must be applied out of band
via either:

- `npx tsx scripts/apply-manual-sql.ts <filename>` (runs via `DIRECT_URL`), or
- Supabase dashboard → SQL Editor → paste + run.

| File | Purpose |
| ---- | ------- |
| `manual_profile_trigger.sql` | Installs `public.handle_new_user()` + `auth.users` trigger that auto-creates a `profiles` row for every new auth user. |

Files here are prefixed `manual_` (no numeric `000X_`) so they're visually
distinct from the drizzle-kit sequence.

### Re-generating migrations safely

When you run `npx drizzle-kit generate` after changing `src/db/schema.ts`,
drizzle-kit will emit a `CREATE TABLE "auth"."users"` block because we mirror
that table as an external reference (see the comment at the top of `schema.ts`).
**Always strip that block** from the generated SQL before running `migrate` —
the real `auth.users` table is owned by Supabase Auth and already exists.
