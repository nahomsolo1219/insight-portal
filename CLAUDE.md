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

> **Design system: see [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) — all UI work (admin, client, field staff) must conform.** The summary below stays as a quick reference; the full doc has token tables, primitive APIs, layout patterns, and a polish list.
>
> **Portal + field inventory: see [docs/PORTAL_FIELD_INVENTORY.md](docs/PORTAL_FIELD_INVENTORY.md) — per-page breakdown of `/portal` and `/field`, auth/RLS posture, server actions, and gaps against the original scope.**


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

## Field staff app

- Route group: `src/app/field/` — mobile-first, full-bleed, no sidebar, no bottom tabs.
- Layout: teal header band with logo + sign-out, content area scrolls. iOS safe-area insets via `.safe-area-top` / `.safe-area-bottom` utilities (added to globals.css).
- Auth: requires `role = 'field_staff'`. Admins are explicitly allowed for testing. Clients get bounced to `/portal`.
- **Scoping (post-0007):** field staff see only properties / projects / appointments tied to a `project_assignments` row matching their `auth.uid()`. A user with zero assignments lands on a "No projects assigned yet — contact your admin" empty state on `/field/upload`. Admins bypass the scope (testing). Admins manage assignments via the admin project surface (Part 2 of this work — not yet built).
- Pages:
  - `/field` — today's schedule, scoped to assignments; big "Upload to any property" CTA; recent uploads strip with status dots (pending = amber, categorized = emerald, rejected = red).
  - `/field/upload` — property + project pickers (assignment-scoped), optional caption, camera/file input with `capture="environment"` (rear camera default on mobile), thumbnail strip, gold upload CTA, GPS prefetch + status row, success card.
- Upload action: `uploadFieldPhotos` always lands rows as `status = 'pending'` so the admin Photo Queue stays the single source of truth for client visibility. Per-file isolation — one bad image doesn't fail the whole batch. Audits the batch as one entry. Server-side check rejects uploads against unassigned properties / projects (RLS is the safety net).
- Project picker: `getPropertyProjectsAction` server action refreshes the project list when the technician changes the property dropdown — avoids passing the full property→projects map up front.
- Storage: uses the existing `photoPath` helper + `'photos/'` prefix so the existing "Field staff upload photos" RLS policy gates inserts. The policy was tightened in 0007 to also require an assigned project (or NULL `project_id`).

## Vendor documents

- `vendor_documents` table with type enum (insurance, w9, license, contract, certificate, other). Admin-only RLS policy.
- Storage path: `vendor-documents/{vendorId}/{documentId}.{ext}` — admin-only, sits outside the per-client tree.
- Expiration tracking: insurance + license docs carry `expiration_date`. UI buckets each doc into `valid` (>30 days), `expiring` (0-30 days), `expired` (<0 days), or `none` (no date). Stat card on the detail page flags expired (red) > expiring (amber) > default.
- Vendor detail lives at `/admin/vendors/[id]` — clicking a row from the list navigates here. Edit-vendor modal moved to the detail page header so the row stays a pure navigation target.

## Client portal

- Route group: `src/app/portal/` — separate from admin.
- Layout: horizontal top nav (`src/components/portal/PortalNav.tsx`), narrower 900px content column. Designed to read like a concierge experience, not a software dashboard.
- Auth: same Supabase Auth. **No role cookie.** Each layout calls `getCurrentUser()` and redirects on role mismatch — admin layout sends non-admins to `/`, portal layout sends non-clients to `/`. The root `/` page dispatches per role (admin → /admin, client → /portal, field_staff → /login for now).
- Middleware (`src/lib/supabase/middleware.ts`) only handles auth gating: unauthenticated requests to `/admin/*` or `/portal/*` get redirected to `/login?next=…`. Role-based routing happens in the layouts to avoid an extra DB roundtrip on every request.
- Queries in `src/app/portal/queries.ts` — every query takes `clientId` and filters explicitly even though RLS already enforces it.
- Auth callback (`src/app/auth/callback/route.ts`) defaults `next=/`; the root page picks the right per-role destination.
- Clients see: dashboard, projects (timeline), documents, invoices.
- Clients do NOT see: admin pages, pending photos, internal milestones, staff/vendor/template/settings.

## Template builder (phase-based)

- Templates can be phase-based (`project_templates.uses_phases = true`) or legacy flat. Both shapes coexist; `getTemplateWithPhases` in `src/app/admin/templates/queries.ts` branches on the flag.
- Phase-based: `project_templates` → `template_phases` → `template_milestones` (with `phase_id` FK).
- Phase dependencies live in `template_phase_dependencies` (`phase_id` → `depends_on_phase_id`). A phase can depend on multiple predecessors; the input API uses `dependsOnPhaseIndex` which is resolved to IDs after the phases are inserted.
- Decision points are `template_milestones` rows with `is_decision_point = true`, `decision_question`, `decision_type` (uses the shared `question_type` enum), and optional `decision_options` (jsonb string[]).
- Phase-based milestones keep `offset` null — the legacy free-text `offset` field is only used by flat templates. Scheduling information for phase-based templates comes from `template_phases.estimated_days` / `estimated_duration`.
- Create/update actions (`createPhaseTemplate`, `updatePhaseTemplate`) use a delete-and-reinsert pattern — same philosophy as the legacy `updateTemplate`.

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

Files under `src/db/migrations/` prefixed `manual_` are applied out of band — they touch the `auth` or `storage` schemas, which drizzle-kit cannot manage. See `src/db/migrations/README.md` for the full list and rationale.

- `manual_profile_trigger.sql` — `public.handle_new_user()` + `on_auth_user_created` trigger that creates a `profiles` row for every new `auth.users` row.
- `manual_storage_rls.sql` — RLS policies on `storage.objects` for the `insight-files` bucket. Idempotent (drops then re-creates each policy).
- Apply with `npx tsx scripts/apply-manual-sql.ts <filename>` or paste into the Supabase SQL Editor.

## File storage

- Single bucket `insight-files` on Supabase Storage (not public — we always sign URLs server-side).
- Path layout: `{fileType}/{clientId}/...` where fileType ∈ `photos`, `documents`, `invoices`, `reports`. The RLS policy in `manual_storage_rls.sql` assumes exactly this shape.
- Path helpers in `src/lib/storage/paths.ts` — always use `photoPath()`, `documentPath()`, `invoicePath()`, `reportPath()`; never build paths inline.
- Upload / signed-URL / delete helpers in `src/lib/storage/upload.ts` (server-only).
- Client-side shared validation in `src/lib/storage/validation.ts` (safe to import in client components; max 25 MB, explicit MIME allow-lists per `FileKind`).
- `FileUpload` client component in `src/components/admin/FileUpload.tsx` — drag/drop, multi-file, image previews, client-side validation, does NOT upload on its own (parent form posts the staged files to a Server Action).
- `uploadSingleFromForm` / `uploadManyFromForm` in `src/lib/storage/upload-from-form.ts` are the standard adapters from Server-Action `FormData` to the bucket.
- Smoke test: `npx tsx scripts/test-storage.ts` uploads + signs + fetches + deletes a tiny file via service-role.

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
