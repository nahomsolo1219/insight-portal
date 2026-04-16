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

## Auth (coming next)

- Supabase Auth via `@supabase/ssr`. Server Actions run as authenticated user.
- `profiles` table extends `auth.users` with role + client_id/staff_id.
- Never query the database from a client component directly. Use Server Actions or Server Components.

## When compacting, preserve:

- The list of all modified files
- Current page being worked on
- Any pending bugs or issues
- The design rules above
