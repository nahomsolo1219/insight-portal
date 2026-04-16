# Insight HM — Client Portal

Admin portal for Insight Home Maintenance, a luxury home maintenance and remodel firm serving HNW homeowners in SF Bay Area.

## Stack

- Next.js 16+ (App Router), TypeScript strict
- Tailwind CSS v4 with custom brand tokens (configured in `src/app/globals.css` via `@theme`)
- Lucide React for icons
- Supabase Postgres via Drizzle ORM — see "Database" / "Page query pattern" below.

## Commands

- `npm run dev` — start dev server (localhost:3000)
- `npm run build` — production build
- `npm run lint` — ESLint check
- `npx prettier --write .` — format all files

## Code style

- Named exports, not default exports (exception: page.tsx files which Next.js requires as default)
- Use `import type` for type-only imports
- Destructure imports: `import { Button } from '@/components/ui/button'`
- Collocate types in `src/lib/types.ts`, not scattered across files
- Component files: PascalCase (`StatCard.tsx`). Utility files: kebab-case (`mock-data.ts`)
- Prefer `clsx()` for conditional classes, not string concatenation
- NEVER use `any` type. Use `unknown` and narrow, or define a proper type.

## Brand tokens (configured in src/app/globals.css via @theme)

- Primary teal: #1B4F5A (sidebar header, headings, secondary buttons)
- Accent gold: #C8963E (primary CTAs, notification badges)
- Background: #F9F9F7 (main bg), #FFFFFF (cards)
- Body text: #444444, secondary text: #737373
- Font: Inter (sans), DM Serif Display (page titles only)

## Architecture

- `src/app/admin/` — all admin pages (App Router)
- `src/app/admin/<page>/queries.ts` — Drizzle read queries for that page
- `src/app/admin/<page>/actions.ts` — Server Actions for that page (mutations)
- `src/components/` — shared UI components
- `src/db/` — schema, migrations, Drizzle client
- `src/lib/types.ts` — UI-only TypeScript interfaces (DB types come from the Drizzle schema)
- `src/lib/utils.ts` — helper functions
- `scripts/` — CLI helpers (`seed.ts`, `verify-db.ts`, `apply-manual-sql.ts`). Every script that touches the DB starts with `import './_env';` before importing from `@/db`.

## Design rules — IMPORTANT

- Sidebar: teal header band with white logo, white body below for nav
- Active nav: light teal tint (#F4F8F9) with subtle border, NO left border accent
- Cards: white bg, rounded-2xl, shadow only (no visible borders), p-6 minimum
- Page titles: DM Serif Display font, text-3xl
- Stat numbers: font-light (NOT bold) — light weight at large size feels premium
- Status badges: subtle (light bg + colored text), never saturated pills
- Tables: no alternating row colors, generous padding, warm hover
- ONE gold CTA button per section maximum
- Background is warm off-white (#F9F9F7), not pure white or gray
- Modal overlays: backdrop-blur-sm, bg-black/40

## Data model

Client → many Properties → many Projects → many Milestones → Appointments/Photos/Reports
Invoices are admin-uploaded PDFs with fields, NOT synced from QuickBooks.
Milestones with status 'awaiting-client' are "Decisions" (aggregated in their own page).
See `src/lib/types.ts` for complete interfaces.

## Database

- Supabase Postgres. Drizzle ORM. Connection via `DATABASE_URL` (pooled, port 6543) for app, `DIRECT_URL` (port 5432) for migrations.
- Schema in `src/db/schema.ts`. Migrations in `src/db/migrations/`.
- Every table has RLS enabled. Admin role bypasses all checks; client role sees only own data; field_staff inserts photos.
- Monetary values stored as `integer` cents. Convert in UI layer.
- All IDs are UUIDs (`defaultRandom()`).
- `auth.users` is owned by Supabase Auth. We mirror it as an external schema reference in `src/db/schema.ts` only so the FK from `public.profiles.id` can be declared. The `CREATE TABLE "auth"."users"` block that drizzle-kit emits on `generate` MUST be stripped from new migrations before applying.

## Drizzle commands

- `npx drizzle-kit generate` — generate migration from schema changes
- `npx drizzle-kit migrate` — apply pending migrations
- `npx drizzle-kit studio` — visual DB browser at localhost:4983
- `npx tsx scripts/verify-db.ts` — one-off sanity check of tables / RLS / policies / enums
- `npm run db:seed` — idempotent seed of test data (clears + re-inserts; leaves profiles alone)

## Page query pattern

Every admin page follows this structure:

1. `src/app/admin/<page>/queries.ts` — exported async functions that run Drizzle queries. Pure reads, no auth check, no revalidation.
2. `src/app/admin/<page>/page.tsx` — Server Component. Calls `await requireAdmin()` at the top, then fetches all data via `Promise.all()` with the query functions. Renders the UI.
3. `src/app/admin/<page>/actions.ts` — `'use server'` mutations, each wrapped with `requireAdmin()` or `requireUser()`, followed by Drizzle writes, `await logAudit(...)`, and `revalidatePath()` of the affected routes.
4. Client components that post to Server Actions live alongside the page (e.g. `src/app/admin/<page>/NewThingButton.tsx`). They import the action directly and drive it with `useTransition`.

Money formatting: DB columns ending in `_cents` are `integer`. UI uses `formatCurrency(cents)` from `@/lib/utils` — do not pre-divide.

Shared admin chrome (sidebar badges, etc.) reads from `src/components/admin/queries.ts`. The admin layout awaits those once per request and threads them into `<Sidebar>` as props.

## Audit logging

Every Server Action that changes state must call `logAudit()` from `src/lib/audit.ts` after its Drizzle write. Pattern:

```ts
const user = await requireAdmin();
// ... do the thing ...
await logAudit({
  actor: user,
  action: 'created client',   // strongly typed — add new actions to the AuditAction union as needed
  targetType: 'client',
  targetId: newClient.id,
  targetLabel: newClient.name,
  clientId: newClient.id,
});
```

- The `action` union is intentionally restrictive. Don't pass freeform strings; extend the union in `src/lib/audit.ts` when adding a new mutation.
- `logAudit` never throws — a broken audit log must never block a user action. Failures land in the server logs.
- Populate `clientId` with the affected client's id whenever the action is client-scoped; use `null` for workspace-wide changes (tiers, settings, staff invites).

## Auth

- Supabase Auth via `@supabase/ssr`. Magic-link sign-in (passwordless).
- `src/lib/supabase/server.ts` — server client (Server Components / Server Actions)
- `src/lib/supabase/client.ts` — browser client (only from `'use client'` files)
- `src/lib/supabase/middleware.ts` — refreshes the session cookie on every request
- `src/middleware.ts` — protects `/admin/*`; redirects unauthenticated users to `/login?next=…`
- `src/lib/auth/current-user.ts` — `getCurrentUser()`, `requireUser()`, `requireAdmin()` (server-only)
- `src/app/login/page.tsx` + `LoginForm.tsx` — magic-link form
- `src/app/auth/callback/route.ts` — exchanges the code for a session cookie
- `src/app/logout/route.ts` — POST-only sign-out handler, posted to from the sidebar footer
- Use `requireAdmin()` at the top of every admin-only Server Action. Do NOT rely on middleware alone for mutation authorization.
- Never call the database from a client component. Client components invoke Server Actions or fetch from route handlers.

## Manual Supabase SQL

Files under `src/db/migrations/` prefixed with the names in the table in `src/db/migrations/README.md` are applied out of band (they touch the `auth` schema, which drizzle-kit cannot manage):

- `0001_profile_trigger.sql` — `public.handle_new_user()` + `on_auth_user_created` trigger that creates a `profiles` row for every new `auth.users` row.
- Apply with `npx tsx scripts/apply-manual-sql.ts <filename>` or paste into the Supabase SQL Editor.

## Inviting users

Users never self-sign-up for this product; every account is curated by David.

- `inviteUser({ email, fullName, role, clientId?, staffId? })` in `src/app/admin/staff/actions.ts`
- Uses the service-role Supabase client. Sends a Supabase invite email whose callback lands on `/auth/callback?next=/admin`.
- `NEXT_PUBLIC_SITE_URL` in `.env.local` determines the callback origin — keep this in sync per environment.
- The signup trigger defaults unspecified new users to `role = 'admin'` so that the very first account (David) can reach the dashboard. Tighten this default once the staff/client invite flows are in use and Supabase Dashboard → Authentication → "Enable sign ups" has been turned off.

## When compacting, preserve:

- The list of all modified files
- Current page being worked on
- Any pending bugs or issues
- The design rules above
