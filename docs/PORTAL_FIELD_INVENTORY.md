# Portal + Field — Inventory

An evidence-based inventory of what's actually built under `/portal` and
`/field`, grounded in source. Read this before deciding to finish, refactor,
or rebuild.

This document describes **what exists today**. It was rewritten after the
portal was made property-scoped and after field-staff assignment scoping
landed — earlier revisions described a flat `/portal/projects` structure and
an unscoped field surface; both are wrong now. File paths are cited; exact
line numbers are omitted because they drift.

> ⚠️ **No RLS backstop.** The Drizzle client connects as a role with
> **BYPASSRLS** (the Supabase pooler `postgres` role), so RLS is effectively
> OFF for all app traffic. Every "RLS posture" note below describes the
> *explicit query filter*, which is the ONLY enforcement — not an RLS policy.
> See the CRITICAL note at the top of [CLAUDE.md](../CLAUDE.md).

---

## Client Portal (`/portal`)

**The portal is property-scoped.** `/portal` is a landing page; the working
surfaces live under `/portal/p/[propertyId]/…`. A client with two properties
picks one (or uses the sidebar **property switcher**) and every page then shows
that one home.

### Landing / property picker — `/portal`

- **File:** [src/app/portal/page.tsx](../src/app/portal/page.tsx) + [heroCopy.ts](../src/app/portal/heroCopy.ts)
- **Purpose:** One editorial card per property the client owns (cover photo,
  status chip, active-project / pending-decision counts, next appointment),
  plus a state-aware hero line. Clicking a card enters `/portal/p/[id]/dashboard`.
- **Data:** `getClientPropertyLandingCards(clientId)` in [src/app/portal/queries.ts](../src/app/portal/queries.ts).
- **Scope:** `eq(properties.clientId, clientId)` then per-property aggregate reads.

### Per-property layout — `/portal/p/[propertyId]`

- **File:** [src/app/portal/p/[propertyId]/layout.tsx](../src/app/portal/p/[propertyId]/layout.tsx)
- **Ownership gate:** validates the URL's `propertyId` belongs to the signed-in
  client (`and(eq(properties.id, propertyId), eq(properties.clientId, clientId))`);
  a forged/foreign id redirects to `/portal`.
- **Chrome:** [PortalSidebar](../src/components/portal/PortalSidebar.tsx) — dark
  teal fixed column with the **property switcher** (a pill that opens a dropdown
  when the client owns ≥ 2 properties), nav links, notifications bell, and
  profile menu. (There is no top/bottom `PortalNav` bar anymore.)

### Dashboard — `/portal/p/[propertyId]/dashboard`

- **File:** [dashboard/page.tsx](../src/app/portal/p/[propertyId]/dashboard/page.tsx) + [heroCopy.ts](../src/app/portal/p/[propertyId]/dashboard/heroCopy.ts)
- **Purpose:** Property hero (state-aware, functional copy), featured-decision
  card, three stat cards (active projects, decisions, next visit), the
  property's active-project list, recent-activity feed, and a right rail
  (maintenance summary, next-visit, PM contact, recent photos).
- **Data:** all property-scoped except the PM card —
  `getPropertyDashboardData(clientId, propertyId)` (hero + featured decision +
  visit + recent photos + the active-project / pending-decision **counts**),
  `getMaintenancePlanSummary(propertyId)`, `getPropertyActiveProjects(clientId, propertyId)`,
  `getPropertyRecentActivity(clientId, propertyId, 8)`, and the client-level
  `getMyClientProfile(clientId)` for the contact card.
- **Scope:** every read filters by `clientId` and/or the ownership-checked
  `propertyId`. (The stat cards used to pull a client-wide rollup — fixed.)

### Projects list — `/portal/p/[propertyId]/projects`

- **File:** [projects/page.tsx](../src/app/portal/p/[propertyId]/projects/page.tsx)
- **Data:** `getClientProjects(clientId, propertyId)` in [projects/queries.ts](../src/app/portal/p/[propertyId]/projects/queries.ts) — ownership check, then projects on that property + pending-decision counts.
- **Interactivity:** read-only; each card links to `projects/[id]`.

### Project detail — `/portal/p/[propertyId]/projects/[id]`

- **File:** [projects/[id]/page.tsx](../src/app/portal/p/[propertyId]/projects/[id]/page.tsx) → [ProjectTimeline.tsx](../src/app/portal/p/[propertyId]/projects/[id]/ProjectTimeline.tsx)
- **Purpose:** Full vertical timeline — progress hero, milestone cards, decision
  responder on awaiting-client milestones, per-phase + project-wide photos,
  lightbox, "Download all photos" ZIP, next-visit + PM cards.
- **Data:** `getProjectTimeline(projectId, clientId)` in [projects/[id]/queries.ts](../src/app/portal/p/[propertyId]/projects/[id]/queries.ts) — ownership via `innerJoin(projects)/innerJoin(properties).where(eq(projects.id, projectId) AND eq(properties.clientId, clientId))`.
- **Actions** ([actions.ts](../src/app/portal/p/[propertyId]/projects/[id]/actions.ts)): `respondToDecision(milestoneId, response)` (writes `clientResponse`/`respondedAt`/`respondedBy`; status stays `awaiting_client` until admin closes it) and `downloadProjectPhotosAsZip(projectId)` (≤50 photos, 1-hour signed URL).

### Appointments — `/portal/p/[propertyId]/appointments`

- **File:** [appointments/page.tsx](../src/app/portal/p/[propertyId]/appointments/page.tsx) + MiniCalendar + AddToCalendarButton
- **Data:** `getClientAppointments(clientId, propertyId)` and `getAppointmentDates(clientId, propertyId)` in [appointments/queries.ts](../src/app/portal/p/[propertyId]/appointments/queries.ts) — ownership check, then `eq(appointments.propertyId, propertyId)`. Cancelled excluded from both buckets.
- **Actions:** `generateIcsFile(appointmentId)` — RFC-5545 `.ics`, re-checks ownership.

### Documents & reports — `/portal/p/[propertyId]/documents`

- **File:** [documents/page.tsx](../src/app/portal/p/[propertyId]/documents/page.tsx)
- **Purpose:** This property's documents (project-scoped paperwork) and reports
  (vendor-produced inspection/service PDFs). Report titles lead with the vendor
  name (`formatReportTitle`). Preview + Download per row.
- **Data:** `getClientDocuments(clientId, propertyId)` in [documents/queries.ts](../src/app/portal/p/[propertyId]/documents/queries.ts) — ownership check, documents reached via the property's projects (`inArray(documents.projectId, projectIds)`), reports via `eq(reports.propertyId, propertyId)`.

### Invoices — `/portal/p/[propertyId]/invoices`

- **File:** [invoices/page.tsx](../src/app/portal/p/[propertyId]/invoices/page.tsx)
- **Purpose:** Global summary bar (invoiced / paid / outstanding) plus a list
  filtered by **Open / Paid / All** status tabs (URL state `?status=`).
- **Data:** `getClientInvoices(clientId, propertyId)` and `getClientInvoiceSummary(clientId, propertyId)` in [invoices/queries.ts](../src/app/portal/p/[propertyId]/invoices/queries.ts) — `eq(invoices.clientId, clientId) AND (invoices.propertyId = propertyId OR invoices.propertyId IS NULL)`. Unassigned (client-level) invoices show on every property with no property label.

### Maintenance — `/portal/p/[propertyId]/maintenance`

- **File:** [maintenance/page.tsx](../src/app/portal/p/[propertyId]/maintenance/page.tsx)
- **Data:** `getActiveMaintenancePlans(clientId, propertyId)` / `getPastMaintenancePlans(clientId, propertyId)` in [maintenance/queries.ts](../src/app/portal/p/[propertyId]/maintenance/queries.ts) — ownership check, then `eq(maintenancePlans.propertyId, propertyId)`.

### Portal auth / role gating — three layers

1. **Middleware** ([src/lib/supabase/middleware.ts](../src/lib/supabase/middleware.ts)) — unauthenticated `/portal/*` → `/login?next=…`.
2. **Layout** ([src/app/portal/layout.tsx](../src/app/portal/layout.tsx)) — `getCurrentUser()`, bounce non-clients (admin → `/admin`, field_staff → `/field`, missing `clientId` → `/`).
3. **Server actions** — each calls `requireUser()` and re-checks `role === 'client'` before writing.

RLS is **not** a fourth layer for app traffic (BYPASSRLS) — the explicit
`clientId`/`propertyId` filters in every query are the enforcement.

**Property switcher:** exists (PortalSidebar). Each page is scoped to the
selected property; switching re-renders with that property's data.

---

## Field Staff App (`/field`)

**Assignment-scoped.** Field staff see only what they're assigned to, via the
`project_assignments` table (`userId = auth.uid()`). A tech with zero
assignments sees empty states until an admin assigns them. Admins bypass the
scope for testing.

### Today's schedule — `/field`

- **File:** [src/app/field/page.tsx](../src/app/field/page.tsx)
- **Data:** `getTodaysFieldSchedule(userId)` and `getMyRecentUploads(userId, 12)` in [src/app/field/queries.ts](../src/app/field/queries.ts).
- **Scope:** the schedule is gated by an `exists(project_assignments … where userId = :userId AND projects.propertyId = appointments.propertyId)` subquery — an appointment surfaces only if the tech is on some project at that property. Recent uploads are scoped to `photos.uploadedByUserId = userId`.

### Photo capture — `/field/upload`

- **File:** [upload/page.tsx](../src/app/field/upload/page.tsx) → [MobilePhotoCapture.tsx](../src/app/field/upload/MobilePhotoCapture.tsx)
- **Data:** `getAssignedProperties(userId)` (properties with ≥1 assigned project) and `getAssignedPropertyProjects(propertyId, userId)` (assigned projects on the picked property). Both filter on `project_assignments.userId`.
- **Actions** ([actions.ts](../src/app/field/actions.ts)): `uploadFieldPhotos(propertyId, input, formData)` — validates each file (MIME + 25 MB), `photoPath(clientId, propertyId, photoId, ext)`, uploads, inserts `photos` rows as `status='pending'`; per-file isolation. `getPropertyProjectsAction(propertyId)` refreshes the picker. Both re-check the assignment/role and reject unassigned targets.

### Assignment management (admin side)

Admins assign field staff to projects via the **Team tab on the admin project
detail page** ([TeamTabClient.tsx](../src/app/admin/projects/[id]/TeamTabClient.tsx)) —
`assignStaffToProject` / `unassignStaffFromProject` in that route's
[actions.ts](../src/app/admin/projects/[id]/actions.ts). This is what populates
`project_assignments` and therefore what a field tech can see.

### Field auth / role gating

1. **Middleware** — unauthenticated `/field/*` → `/login?next=…`.
2. **Layout** ([src/app/field/layout.tsx](../src/app/field/layout.tsx)) — clients → `/portal`; only `field_staff` and (for testing) `admin` proceed. Role gating ONLY — data scoping is in the queries above.
3. **Server actions** — re-check `role ∈ {field_staff, admin}` and assignment ownership.

**Field photo notes:** GPS columns exist on `photos` but the upload path does
not populate `gps_lat`/`gps_lng`. `uploadedAt` is DB `defaultNow()` (upload
time, not capture/EXIF time).

---

## Shared / Cross-Cutting

### Auth + storage

| Module | Notes |
|---|---|
| [src/lib/supabase/middleware.ts](../src/lib/supabase/middleware.ts) | One matcher gates `/admin/*`, `/portal/*`, `/field/*`; unauth → `/login?next=…`. |
| [src/lib/auth/current-user.ts](../src/lib/auth/current-user.ts) | `getCurrentUser` / `requireUser` / `requireAdmin`. |
| [src/lib/storage/paths.ts](../src/lib/storage/paths.ts) | `{fileType}/{clientId}/…` layout — `photoPath`, `documentPath`, `invoicePath`, `reportPath`. |
| [src/lib/storage/upload.ts](../src/lib/storage/upload.ts) | `uploadFile`, `getSignedUrl(s)`, admin (`…Admin`) service-role variants, `deleteFile`. |

### Photos workflow (field → admin → portal)

- Field uploads land `status='pending'` (never client-visible).
- Admin reviews via `/admin/photo-queue` or the per-client Photos tab → flips to
  `status='categorized'` with a tag / category / projectId.
- Portal photo reads filter `eq(photos.status, 'categorized')`.

### Storage bucket RLS

[manual_storage_rls.sql](../src/db/migrations/manual_storage_rls.sql) governs
`storage.objects` for the `insight-files` bucket (admins full access; clients
read their own `{fileType}/{clientId}/…` prefix except pending photos; field
staff insert under `photos/` and read only their own uploads). **Note:** these
storage-layer policies ARE enforced (they gate the Supabase Storage API), unlike
table RLS which the Drizzle `postgres` role bypasses.

### Profile auto-create trigger

[manual_profile_trigger.sql](../src/db/migrations/manual_profile_trigger.sql)
installs `on_auth_user_created`, which creates a `profiles` row per new
`auth.users` row. The role fallback (for a user with no role metadata) is now
**`'client'`** — superseded by
[manual_profile_trigger_default_client.sql](../src/db/migrations/manual_profile_trigger_default_client.sql),
which changed the old fail-open `'admin'` default to fail-safe `'client'`
(NULL `client_id` → empty portal). Invite flows always pass an explicit role,
so the fallback only governs metadata-less rows.

---

## Notable gaps / caveats

- **Field GPS not captured** — schema columns exist; write path never sets them.
- **Photos have no standalone `/portal` page** — surfaced inside the project
  timeline + dashboard widget only.
- **Decision status lingers** — after a client responds, the milestone stays
  `awaiting_client` until an admin marks it complete, so nav badge counts don't
  drop immediately.
- **No RLS backstop for table reads** — the single most important thing to know
  before adding any query. See the CRITICAL note in [CLAUDE.md](../CLAUDE.md).
