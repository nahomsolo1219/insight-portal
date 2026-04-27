# Portal + Field — Discovery & Inventory

A clear-eyed, evidence-based inventory of what's actually built under `/portal` and
`/field`. Treats the surfaces as if no one knew their history; every claim is cited
with `file:line`. Read this before deciding to finish, refactor, or rebuild.

This document describes **what exists today**. Aspirational changes go to
[DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)'s polish list, not here.

---

## Client Portal (`/portal`)

### Dashboard — `/portal`

- **File path:** [src/app/portal/page.tsx](../src/app/portal/page.tsx)
- **Purpose:** At-a-glance home: stat cards (active projects, pending decisions, upcoming visits), active project rows with progress bars, upcoming visits, recent photos thumbnail strip, recent activity feed, and PM contact card.
- **Data source:** Six parallel queries from [src/app/portal/queries.ts](../src/app/portal/queries.ts) — `getMyClientProfile`, `getClientDashboardStats`, `getClientUpcomingAppointments(clientId, 3)`, `getClientActiveProjects`, `getClientRecentActivity(clientId, 8)`, `getClientRecentPhotos(clientId, 6)`. No hardcoded values.
- **RLS posture:** Explicit `eq(properties.clientId, clientId)` on every query (e.g. queries.ts:78, 230, 269, 440), then `inArray(propertyIds | projectIds, …)` on derived child reads. Defence-in-depth — RLS is also active on every table.
- **Interactivity:** Pure read. Activity-feed rows are `<Link>` elements that navigate to the relevant project / documents / invoices page (no mutations).
- **Completeness:** **complete**.
- **Known gaps:** No `loading.tsx` skeleton; the page suspends on its `Promise.all`. No error boundary. Activity feed has no "load more" beyond the initial 8.

### Projects list — `/portal/projects`

- **File path:** [src/app/portal/projects/page.tsx](../src/app/portal/projects/page.tsx)
- **Purpose:** Card grid of every project across the client's properties. Active first, then by start date desc. Each card shows progress bar, type icon, end date, property name, and a pending-decision badge.
- **Data source:** `getClientProjects(clientId)` in [src/app/portal/projects/queries.ts:29](../src/app/portal/projects/queries.ts#L29). Three reads (properties → projects → pending-decision counts) merged in-memory.
- **RLS posture:** Explicit `eq(properties.clientId, clientId)` (queries.ts:37) → `inArray(projects.propertyId, propertyIds)` (queries.ts:55) → `inArray(milestones.projectId, projectIds)` for badge counts (queries.ts:73).
- **Interactivity:** Read-only. Each card links to `/portal/projects/[id]`.
- **Completeness:** **complete**.
- **Known gaps:** No status filter (active/completed/on-hold all rendered together with opacity differentiation only). No sort affordance. No pagination — fine while clients have <10 projects, but no UX if that grows.

### Project detail — `/portal/projects/[id]`

- **File path:** [src/app/portal/projects/[id]/page.tsx](../src/app/portal/projects/[id]/page.tsx) (Server Component) → [ProjectTimeline.tsx](../src/app/portal/projects/[id]/ProjectTimeline.tsx) (Client Component)
- **Purpose:** Full vertical project timeline — hero card with progress, phase-by-phase milestone cards with status indicators, decision-response UI on awaiting-client milestones, photo strip per phase plus a project-wide Photos section, photo lightbox with tag/category filters, "Download all photos" ZIP, next-visit card, PM contact card.
- **Data source:** `getProjectTimeline(projectId, clientId)` in [queries.ts:113](../src/app/portal/projects/[id]/queries.ts#L113). One ownership check (lines 120–140), then a five-way `Promise.all` for property / PM / milestones / photos / next-appointment. Photos signed in one batch (line 230).
- **RLS posture:** Ownership via `innerJoin(projects).innerJoin(properties).where(and(eq(projects.id, projectId), eq(properties.clientId, clientId)))` (queries.ts:136-137). Photos query uses `or(eq(projectId, projectId), and(eq(propertyId, project.propertyId), isNull(projectId)))` (queries.ts:204-214) — pulls property-level photos that lack a project link.
- **Interactivity:** Two server actions in [actions.ts](../src/app/portal/projects/[id]/actions.ts):
  - `respondToDecision(milestoneId, response)` (actions.ts:25) — wired through `DecisionResponder` in [ProjectTimeline.tsx:400](../src/app/portal/projects/[id]/ProjectTimeline.tsx#L400). Writes `clientResponse` + `respondedAt` + `respondedBy`. Status stays `awaiting_client` so admin reviews before flipping complete.
  - `downloadProjectPhotosAsZip(projectId)` (actions.ts:115) — service-role storage upload of an in-memory ZIP, returns a 1-hour signed URL. Capped at 50 photos.
- **Completeness:** **complete**.
- **Known gaps:** ZIP cap of 50 returns an error toast above that count; no UI affordance ("download in batches"). Decision response cap of 2,000 chars is server-only; no client pre-validation. After client responds, the milestone shows a green "Responded" badge but the status enum stays `awaiting_client` until admin marks complete — the doc-status story may confuse a returning client who expects a state change.

### Appointments — `/portal/appointments`

- **File path:** [src/app/portal/appointments/page.tsx](../src/app/portal/appointments/page.tsx) + [MiniCalendar.tsx](../src/app/portal/appointments/MiniCalendar.tsx) + [AddToCalendarButton.tsx](../src/app/portal/appointments/AddToCalendarButton.tsx)
- **Purpose:** Mini month-grid calendar with dot indicators on appointment days, plus upcoming and past appointment cards. Each upcoming card has a per-appointment "Add to calendar" .ics download.
- **Data source:** `getClientAppointments(clientId)` and `getAppointmentDates(clientId)` in [queries.ts](../src/app/portal/appointments/queries.ts). Cancelled appointments excluded from both upcoming and past buckets (queries.ts:76).
- **RLS posture:** Scope starts at `eq(properties.clientId, clientId)` (queries.ts:40-43), then `inArray(appointments.propertyId, propertyIds)` (queries.ts:69). No direct `clientId` column on appointments; ownership inherited via property join.
- **Interactivity:** One server action — `generateIcsFile(appointmentId)` ([actions.ts:26](../src/app/portal/appointments/actions.ts#L26)) — returns RFC 5545–compliant `.ics` content + filename. Re-checks ownership via the join.
- **Completeness:** **complete**.
- **Known gaps:** No filter by property or vendor. Cancelled appointments are silently hidden — fine but could surprise a client looking for one they remember being scheduled. `.ics` uses floating local time (no `TZID`), which is correct semantically for "9 AM Pacific = 9 AM" but means the calendar app inherits the user's device tz.

### Documents & reports — `/portal/documents`

- **File path:** [src/app/portal/documents/page.tsx](../src/app/portal/documents/page.tsx)
- **Purpose:** Property-bucketed list of contracts/permits/drawings (project-scoped) and inspections/assessments/year-end reports (property-scoped). Each row has a Preview (PDFs only) + Download chip.
- **Data source:** `getClientDocuments(clientId)` in [queries.ts:53](../src/app/portal/documents/queries.ts#L53). Properties → projects → docs + reports in parallel; URLs signed in one batch.
- **RLS posture:** Properties scoped (line 55-62), projects derived (line 79), docs filtered by `inArray(documents.projectId, projectIds)` (line 100), reports filtered by `inArray(reports.propertyId, propertyIds)` (line 114).
- **Interactivity:** Read-only. Preview opens [PdfViewer](../src/components/portal/PdfViewer.tsx) modal (iframe-based, only for `.pdf` paths). Download opens signed URL in new tab.
- **Completeness:** **complete**.
- **Known gaps:** No filter by document type or date range. Reports and documents share a property card with sub-headers — visually mild separation. The `documents.type` column is free text (admin types whatever); the icon mapping in [page.tsx:251-273](../src/app/portal/documents/page.tsx#L251) normalizes by lowercasing but unknown types fall through to a generic file icon.

### Invoices — `/portal/invoices`

- **File path:** [src/app/portal/invoices/page.tsx](../src/app/portal/invoices/page.tsx)
- **Purpose:** Summary bar (total invoiced, paid, outstanding) plus invoice cards with status badge, line items, due date, property, PDF preview/download.
- **Data source:** `getClientInvoices(clientId)` (queries.ts:32) and `getClientInvoiceSummary(clientId)` (queries.ts:80).
- **RLS posture:** Direct `eq(invoices.clientId, clientId)` (line 49). Projects + properties are left-joins for context only.
- **Interactivity:** Read-only. PdfViewer + Download chip per card.
- **Completeness:** **complete**.
- **Known gaps:** No status filter. No aging analysis (overdue >30 days). Summary treats `partial` as outstanding (correct accounting; just no separate UI bucket). No CSV export.

### Portal summary

**Auth/role gating** — three layers, all enforcing:

1. **Middleware** ([src/lib/supabase/middleware.ts:45-63](../src/lib/supabase/middleware.ts#L45)) — any unauthenticated request to `/portal/*` redirects to `/login?next={pathname}`. Role check is deferred to the layout to avoid a DB roundtrip on every request.
2. **Layout** ([src/app/portal/layout.tsx:27-34](../src/app/portal/layout.tsx#L27)):
   ```ts
   const user = await getCurrentUser();
   if (!user) redirect('/login');
   if (user.role === 'admin') redirect('/admin');
   if (user.role === 'field_staff') redirect('/field');
   if (user.role !== 'client' || !user.clientId) redirect('/');
   ```
   Non-client roles bounce to their proper home; clients without a `clientId` link bounce to `/`. RLS would also block any cross-client reads.
3. **Server actions** — every action under `src/app/portal/**` calls `requireUser()` first and re-checks `role === 'client'` before any write. Documented in the per-page blocks above.

**Property switcher** — none. The portal is intentionally household-scoped: every page shows everything across all the client's properties. Confirmed by reading every portal page; no property picker UI exists. (Compare to admin's `ClientDetailTabs` 0/1/2+ branches.)

**Decisions flow** — built end-to-end:
- Visible in three places: dashboard stat card, project list badge, and inline on the project timeline.
- The interactive responder lives in [ProjectTimeline.tsx:400](../src/app/portal/projects/[id]/ProjectTimeline.tsx#L400) (`DecisionResponder`). It branches on `questionType`:
  - `acknowledge` → single button "I've read this"
  - `approval` → Approve / Request changes
  - `open` → textarea
  - `single` / `multi` → tile grid with image+label, requires confirm before submit
- Submission calls `respondToDecision(milestoneId, response)` ([actions.ts:25](../src/app/portal/projects/[id]/actions.ts#L25)). The action writes `clientResponse`, `respondedAt`, `respondedBy`, audits `'responded to decision'`, and revalidates `/portal/projects`. **Status remains `awaiting_client` after the client responds** — the admin must mark complete to close the loop. Worth flagging because the badge count on the portal nav doesn't drop until then.

**Navigation** — [PortalNav.tsx](../src/components/portal/PortalNav.tsx) renders both the desktop top bar (md+) and the mobile bottom-tab bar (<md) from one `NAV_LINKS` array (lines 52-81):

| Href | Label | Badge driver |
|---|---|---|
| `/portal` | Dashboard | — |
| `/portal/projects` | Projects | `pendingDecisions` |
| `/portal/appointments` | Appointments | — |
| `/portal/documents` | Documents | `newDocuments` (last 7 days) |
| `/portal/invoices` | Invoices | `unpaidInvoices` (`unpaid` + `partial`) |

Badge counts come from `getPortalBadgeCounts(clientId)` ([queries.ts:443](../src/app/portal/queries.ts#L443)) — fetched in the layout, threaded as a prop. Capped visually at "9+".

**Server actions defined under `src/app/portal/`:**

| File | Function | Purpose |
|---|---|---|
| `actions.ts` | `updateMyProfile({ name, email, phone })` | Client edits own profile chip from the user-menu modal. |
| `projects/[id]/actions.ts` | `respondToDecision(milestoneId, response)` | Records client's answer to an awaiting-client decision. |
| `projects/[id]/actions.ts` | `downloadProjectPhotosAsZip(projectId)` | Bundles ≤50 categorized photos, returns 1-hour signed URL. |
| `appointments/actions.ts` | `generateIcsFile(appointmentId)` | Returns single-event `.ics` content + filename. |

All four wrap with `'use server'`, gate via `requireUser()` + role re-check, and call `logAudit()` after writes.

---

## Field Staff App (`/field`)

### Today's schedule — `/field`

- **File path:** [src/app/field/page.tsx](../src/app/field/page.tsx)
- **Purpose:** Dispatcher home — today's appointments across **all active clients** (field staff are dispatched anywhere), plus a strip of the current technician's recent uploads with status dots (pending=amber / categorized=emerald / rejected=red), plus a big "Upload to any property" CTA.
- **Data source:** `getTodaysFieldSchedule()` and `getMyRecentUploads(user.id, 12)` in [queries.ts](../src/app/field/queries.ts). Query filters on `appointments.date = today` and `inArray(appointments.status, ['scheduled', 'confirmed'])` (queries.ts:58-59); recent uploads filter on `photos.uploadedByUserId = userId` (queries.ts:146).
- **RLS posture:** Schedule query has **no client/property scope** — by design. Field staff "are dispatched anywhere" per CLAUDE.md, so the page deliberately reads across all active clients. Row-level security on `appointments` does not block this for the `field_staff` role; this is intentional. Recent uploads are scoped to `uploadedByUserId = auth.uid()` which matches the photos RLS policy.
- **Interactivity:** No server actions called from this page. Each schedule row links to `/field/upload?propertyId=…&projectId=…` to pre-select.
- **Completeness:** **complete**.
- **Known gaps:** No swipe-to-refresh on mobile (relies on browser pull-to-refresh). No "tomorrow" peek. No filter to hide completed appointments mid-day.

### Photo capture — `/field/upload`

- **File path:** [src/app/field/upload/page.tsx](../src/app/field/upload/page.tsx) (Server Component) → [MobilePhotoCapture.tsx](../src/app/field/upload/MobilePhotoCapture.tsx) (Client Component)
- **Purpose:** Property + project picker, optional caption, camera/gallery file input, thumbnail strip with per-file remove, gold submit CTA, and a success card with "Upload more" / "Back to home" follow-ups.
- **Data source:** Server wrapper fetches `getAllActiveProperties()` (queries.ts:79) and conditionally `getPropertyProjects(initialPropertyId)` (queries.ts:96) when the URL pre-pins a property. The project list refreshes via `getPropertyProjectsAction` server action when the property dropdown changes.
- **RLS posture:** Property list filters `eq(clients.status, 'active')` only — **all active properties shown to every field staff** (no assigned-property scope). Same for projects (filtered by property + active status).
- **Interactivity:** Two server actions in [actions.ts](../src/app/field/actions.ts):
  - `uploadFieldPhotos(propertyId, input, formData)` (actions.ts:44) — main upload pipeline.
  - `getPropertyProjectsAction(propertyId)` (actions.ts:160) — refreshes the project picker after property change.
- **Completeness:** **complete** for the upload flow.
- **Known gaps:** **GPS coordinates are not captured** (see deep-dive below). No retake / edit step. No client-side image compression — files go to the server at full camera resolution (HEIC/JPEG can be 5–8 MB each, which is why [next.config.ts](../next.config.ts) sets `serverActions.bodySizeLimit: '25mb'`).

### Field deep-dive (the bits that matter)

#### Photo capture — end-to-end?

**File picker** ([MobilePhotoCapture.tsx:295-304](../src/app/field/upload/MobilePhotoCapture.tsx#L295)):

```tsx
<input
  ref={fileInputRef}
  id={fileInputId}
  type="file"
  accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
  capture="environment"   // rear camera default on mobile
  multiple
  onChange={onFiles}
  className="sr-only"
/>
```

**Submit** ([MobilePhotoCapture.tsx:121-151](../src/app/field/upload/MobilePhotoCapture.tsx#L121)) — builds `FormData`, appends every picked file under the `'photos'` key, calls the server action.

**Server action** ([actions.ts:44](../src/app/field/actions.ts#L44)) — iterates `formData.getAll('photos')`, validates each (MIME + 25 MB cap), generates a UUID, builds `photoPath(clientId, propertyId, photoId, ext)` → `photos/{clientId}/{propertyId}/{photoId}.{ext}`, calls [`uploadFile`](../src/lib/storage/upload.ts) (server-side Supabase client), then inserts into `photos`:

```ts
await db.insert(photos).values({
  id: photoId,
  propertyId,
  projectId,
  uploadedByUserId: user.id,
  uploadedByName,                   // user.fullName || user.email
  caption: trimmedCaption || file.name,
  status: 'pending',                 // always pending — admin Photo Queue is the gate
  storagePath: uploadResult.path,
});
```

Per-file try/catch isolates failures; the action returns `{ uploadedCount, failedCount, errors }` so the UI can render "2 uploaded · 1 failed" inline.

**Verified facts:**

- ✅ **End-to-end functional** — files reach Supabase storage and a `photos` row lands with the right status, propertyId, projectId, uploadedByUserId, uploadedByName, caption, storagePath.
- ❌ **GPS not captured.** Confirmed by grep: zero matches for `geolocation`, `getCurrentPosition`, `gpsLat`, or `gpsLng` in `MobilePhotoCapture.tsx` or `actions.ts`. The schema columns `gps_lat`/`gps_lng` exist on the `photos` table but nothing writes them. Reads do — the lightbox + admin photo queue surface coords if present, but always blank in practice.
- ⚠️ **Timestamp is DB-set, not client-set.** The insert omits `uploadedAt`; the `defaultNow()` on the schema column ([schema.ts:366](../src/db/schema.ts#L366)) records the moment the row is inserted, which lags whenever the photo was actually shot by however long the upload took. If the camera EXIF said "shot at 9:00 AM" and upload happens at 5:00 PM, the record says 5:00 PM. No EXIF parsing happens.
- ✅ `uploadedByName` snapshotted from `user.fullName || user.email` so the audit trail survives a profile rename.
- ✅ `milestoneId` is intentionally omitted on upload — it's set by the admin during categorization.
- ✅ Per-file isolation: one bad file doesn't fail the batch.

#### Property selection

The property dropdown is sourced from `getAllActiveProperties()` (queries.ts:79):

```sql
SELECT properties.*, clients.name AS clientName
FROM properties
INNER JOIN clients ON clients.id = properties.client_id
WHERE clients.status = 'active'
ORDER BY clients.name, properties.name
```

**No assignment scoping.** Every field-staff user sees every property under every active client. After a property is picked, the project list filters to `projects.propertyId = picked AND projects.status = 'active'`.

#### Auth/role gating for `/field`

Same three-layer pattern as portal:

1. **Middleware** redirects unauthenticated requests on `/field/*` to `/login?next=…`.
2. **Layout** ([src/app/field/layout.tsx:14-18](../src/app/field/layout.tsx#L14)):
   ```ts
   const user = await getCurrentUser();
   if (!user) redirect('/login');
   if (user.role === 'client') redirect('/portal');
   if (user.role !== 'field_staff' && user.role !== 'admin') redirect('/');
   ```
   Clients are bounced to their portal. **Admins are explicitly allowed** for testing — that's intentional.
3. **Server actions** — `uploadFieldPhotos` and `getPropertyProjectsAction` re-check `user.role === 'field_staff' || user.role === 'admin'`.

#### Server actions defined under `src/app/field/`

| Function | File | Purpose | Pre-checks |
|---|---|---|---|
| `uploadFieldPhotos(propertyId, input, formData)` | `actions.ts:44` | Validate files, upload each to storage, insert per-file `photos` rows as `status='pending'`, audit batch | `requireUser()`, role∈{field_staff, admin}, property exists, ≥1 file, MIME + size validation |
| `getPropertyProjectsAction(propertyId)` | `actions.ts:160` | Refresh project picker on property change | `requireUser()`, role check |

---

## Shared / Cross-Cutting

### Auth + session infrastructure

| Module | Used by portal? | Used by field? | Notes |
|---|---|---|---|
| [src/middleware.ts](../src/middleware.ts) → [src/lib/supabase/middleware.ts](../src/lib/supabase/middleware.ts) | ✓ | ✓ | One matcher gates `/admin/*`, `/portal/*`, `/field/*`. Unauth → `/login?next=…`. |
| [src/lib/supabase/server.ts](../src/lib/supabase/server.ts) `createClient()` | ✓ | ✓ | Async server client; reads cookies via `next/headers`. |
| [src/lib/supabase/client.ts](../src/lib/supabase/client.ts) `createClient()` | ✓ | ✓ | Sync browser client for `'use client'`. |
| [src/lib/auth/current-user.ts](../src/lib/auth/current-user.ts) `getCurrentUser` / `requireUser` / `requireAdmin` | ✓ | ✓ | All three layouts use these. Field actions use `requireUser` + manual role check. |
| [src/lib/audit.ts](../src/lib/audit.ts) `logAudit` | ✓ | ✓ | Both surfaces' mutations log here. |

### Storage layer (shared by portal-read + field-write)

| Module | Used for |
|---|---|
| [src/lib/storage/paths.ts](../src/lib/storage/paths.ts) | `BUCKET_NAME = 'insight-files'`, plus `photoPath(clientId, propertyId, photoId, ext)` etc. |
| [src/lib/storage/upload.ts](../src/lib/storage/upload.ts) | `uploadFile`, `getSignedUrl`, `getSignedUrls`, `deleteFile`. |
| [src/lib/storage/validation.ts](../src/lib/storage/validation.ts) | Client-side MIME + 25 MB cap shared across upload UIs. |

### Photos table — the cross-area workflow

The `photos` table ([schema.ts:351-375](../src/db/schema.ts#L351)) is the contract between field and portal:

- Field uploads land as `status='pending'` (never visible to clients).
- Admin reviews via `/admin/photo-queue` or the per-client Photos tab → flips to `status='categorized'` with a `tag` and optional `category` + `projectId`.
- Portal queries filter `eq(photos.status, 'categorized')` — pending photos are invisible by RLS too:

  ```sql
  CREATE POLICY "Clients view own photos" ON "photos" FOR SELECT TO authenticated
  USING (current_user_role() = 'client'
         AND status = 'categorized'
         AND property_id IN (SELECT id FROM properties WHERE client_id = current_user_client_id()));
  ```

- Field staff RLS:
  ```sql
  CREATE POLICY "Field staff insert photos" FOR INSERT
  WITH CHECK (current_user_role() = 'field_staff' AND uploaded_by_user_id = auth.uid());
  CREATE POLICY "Field staff view own photo uploads" FOR SELECT
  USING (current_user_role() = 'field_staff' AND uploaded_by_user_id = auth.uid());
  ```
  Field staff can read **only their own uploads** — no cross-staff visibility, no admin-categorization visibility.

### Storage bucket RLS (mirrors photos table)

[manual_storage_rls.sql](../src/db/migrations/manual_storage_rls.sql):

- Admins: full access.
- Clients: read under `{fileType}/{theirClientId}/…`, **except** pending photos (storage policy joins to `public.photos.status` and excludes `pending`).
- Field staff: insert under `photos/` only, read only objects they personally `owner = auth.uid()`.

### Profile auto-create trigger

[manual_profile_trigger.sql](../src/db/migrations/manual_profile_trigger.sql) — `on_auth_user_created` trigger on `auth.users` inserts a `profiles` row. **Default role is `'admin'`** if `raw_user_meta_data->>'role'` is absent — see CLAUDE.md note about tightening this once invite flows are in regular use.

### Auth flow

- Login: [src/app/login/LoginForm.tsx](../src/app/login/LoginForm.tsx) supports password sign-in, magic link (`signInWithOtp`), and forgot-password.
- Magic-link callback: [src/app/auth/callback/route.ts](../src/app/auth/callback/route.ts) exchanges the code for a session and redirects to `next` (defaults to `/`).
- Logout: [src/app/logout/route.ts](../src/app/logout/route.ts) — POST-only, calls `signOut()` and 303s to `/login`.
- Post-login routing: [src/app/login/page.tsx](../src/app/login/page.tsx) calls `getCurrentUser()` and redirects admins to `/admin`, clients to `/portal`, field staff fall through to the form.

---

## Gaps Against the "What's Next" Plan

The handoff scoped the client portal to: **Dashboard, Projects (with progress + milestone timeline + decisions), Photos (categorized only), Documents, Invoices, Appointments**. Status:

| Spec item | Status | Where it lives |
|---|---|---|
| Dashboard | ✅ Built | `/portal` |
| Projects (list) | ✅ Built | `/portal/projects` |
| Projects (detail with progress + timeline + decisions) | ✅ Built | `/portal/projects/[id]` (`ProjectTimeline.tsx` covers all three) |
| **Photos (categorized only, pending hidden) — as a standalone page** | ❌ **No standalone page** | Photos appear inside the project timeline (per-phase strips + project-wide section) and as a Recent Photos widget on the dashboard. There is no `/portal/photos` route. RLS + queries already enforce "categorized only". |
| Documents | ✅ Built | `/portal/documents` (combines documents + reports) |
| Invoices | ✅ Built | `/portal/invoices` |
| Appointments | ✅ Built (extra — not in original spec list but added later) | `/portal/appointments` |

**What's in the portal that wasn't in the original list:**

- `/portal/appointments` — full month calendar + upcoming/past + .ics export. Added as an explicit feature request later in the build.
- The **Recent Photos** dashboard widget — added during a follow-up "client portal photo visibility" pass.
- The **Recent Activity** dashboard feed — added in the same pass.
- The **Contact FAB** ([ContactFab](../src/components/portal/ContactFab.tsx)) — bottom-right floating action button for client → PM contact.
- The **Add to Calendar** per-appointment .ics download.
- The **PDF Viewer** modal ([PdfViewer](../src/components/portal/PdfViewer.tsx)) wired into Documents and Invoices.

**Field staff app status (not on the original list but built):**

- `/field` (today's schedule) — built, complete.
- `/field/upload` (photo capture) — built, complete except for the GPS-capture omission noted above.

---

## Five-Question Summary

1. **Portal completion:** All 6 originally-spec'd surfaces exist (5 if you count Appointments as add-on). All 6 are wired to real Drizzle queries — none are stubbed. The one structural gap vs. spec is "Photos as a standalone page" — photos are surfaced inside the project timeline and a dashboard widget instead, which is a deliberate-feeling design choice but worth confirming intentional.

2. **Decisions interaction:** Built end-to-end on the **portal** side via `DecisionResponder` + `respondToDecision`. Built on the **admin** side via `markDecisionAwaitingClient` (the admin can promote a milestone from `upcoming` to `awaiting_client` to send it to the client). The full loop works, with one quirk — after the client responds, the milestone status stays `awaiting_client` until admin marks complete, so the badge counts on both sides linger.

3. **Field photo upload:** **Genuinely end-to-end**, with one omission and one minor caveat:
   - **Omission:** GPS coordinates aren't captured (no `geolocation.getCurrentPosition` call). The schema columns exist and the read path surfaces them, but the write path never populates them. If GPS was a stated requirement, this is a real gap.
   - **Caveat:** Timestamps come from the DB `defaultNow()`, not from EXIF or client-side capture-time. Photos record "when the upload completed", not "when the shot was taken".

4. **Auth gating:** Yes — `/portal` is locked to clients. Three layers enforce it: middleware redirects unauthenticated, layout role-checks and bounces non-clients, and server actions re-check `role === 'client'`. RLS on every table is the fourth layer. An anonymous user lands on `/login`. An admin who hits `/portal` is redirected to `/admin`. An admin who tries to call a portal server action gets `Not authorized`.

5. **The most surprising thing:** **Field staff see every active client's properties, not just their assigned ones.** `getAllActiveProperties` filters only on `clients.status = 'active'` — there's no assignment table or filter. CLAUDE.md flags this as deliberate ("field staff can be dispatched anywhere"), but the read posture is much more open than the rest of the system. Combined with the fact that field staff can read only their own photo uploads (per the RLS policy), this means a technician can see the address of every active client but only their own photo history — an asymmetry that's worth understanding before scaling the field-staff role.
