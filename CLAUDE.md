# Insight HM — Client Portal

Admin portal for Insight Home Maintenance, a luxury home maintenance and remodel firm serving HNW homeowners in SF Bay Area.

## Stack

- Next.js 16+ (App Router), TypeScript strict
- Tailwind CSS v4 with custom brand tokens (configured in `src/app/globals.css` via `@theme`)
- Lucide React for icons
- No backend yet — all data is mock data in `src/lib/mock-data.ts`

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
- `src/components/` — shared UI components
- `src/lib/types.ts` — all TypeScript interfaces
- `src/lib/mock-data.ts` — all mock data (single source of truth)
- `src/lib/utils.ts` — helper functions

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
