# Insight HM Admin Portal — Build Plan

## Completed

- [x] Project scaffold + CLAUDE.md + hooks
- [x] Sidebar + admin layout
- [x] Database schema with RLS (Supabase + Drizzle)
- [x] Auth wiring (Supabase Auth + middleware + login page + profile trigger + invite flow)
- [x] Dashboard on real data (queries.ts + Server Component, empty-state aware)
- [x] Seed script (`npm run db:seed`) — idempotent test data for dev
- [x] Sidebar badges wired to live counts (photos pending, decisions pending, invoices unpaid)
- [x] Admin layout restructured to h-screen + internal scroll (fixes sidebar footer layout)
- [x] Audit logging helper (`logAudit` in `src/lib/audit.ts`) + `AuditAction` union
- [x] Clients list page + New Client modal + `createClient` / `archiveClient` Server Actions
- [x] Relaxed NOT NULL on `clients.email` + tightened UI types
- [x] Manual migration file renamed to `manual_` prefix (no more numeric collision with drizzle)
- [x] Client detail page shell (header + stats + property switcher) + Projects tab fully wired (milestone tick → progress % → audit)
- [x] Profile tab (client + property edit modals, archive confirmation, reusable Modal / Field)
- [x] Seed arithmetic: Annual plan progress 35 → 50 (matches 1/2 milestones complete)
- [x] Supabase Storage infrastructure: `insight-files` bucket, path-based RLS, path/upload/validation helpers, reusable `FileUpload` component, smoke test
- [x] Documents tab (per-project file library; multi-file upload, signed-URL download, delete with audit, orphan-safe rollbacks)
- [x] Reports tab (single-PDF upload, vendor/project optional, type badges, read tracking on download, delete with audit)
- [x] Invoices tab (8-field upload with dollars→cents parsing, inline status dropdown, summary bar, property→project cascade, delete with audit)
- [x] Appointments tab (create/status/delete, upcoming/past split with collapsible history, David-on-site flag, scope-of-work expansion)
- [x] Photos tab (grid + filters, selection + bulk categorize/reject/delete, single-photo detail with inline categorization, admin upload with auto-categorize when tagged)

## Client detail tabs — all built ✓

## Other pages still on scaffold — migrate one at a time

- [x] Schedule (URL-driven date range, day/week toggle, grouped-by-day, reuses appointment status action)
- [x] Photo queue (pending photos grouped by client, per-client select-all, inline review modal with approve/reject, bulk reject)
- [x] Decisions (urgency-sorted list with overdue/soon/later badges, question body + options, client filter)
- [x] Invoices (cross-client) (summary totals, status + client filters, scoped totals when filtering, inline status toggle)
- [ ] Vendors
- [ ] Staff
- [ ] Templates
- [ ] Settings

## Follow-up for client detail shell

- [ ] Create-Project flow (currently a disabled placeholder button)
- [ ] Decision-resolution flow (awaiting-client milestones — distinct from the complete/pending toggle)
- [ ] Multi-property switcher end-to-end test (needs a seeded client with 2+ properties)

## Next up

- [ ] Vendors / Staff / Templates / Settings pages
- [ ] Email via Postmark
- [ ] Deploy to Vercel

### Design reference

- Sidebar: teal header band + white body (see screenshot in concept)
- Cards: shadow-card, no borders, rounded-2xl
- Tables: no alternating rows, generous padding
- Status badges: subtle tinted backgrounds
- Page titles: DM Serif Display
- Stat numbers: font-light

### Data model

Client → Property → Project → Milestone → Appointment/Photo/Report
Invoices: admin-uploaded PDFs (no QuickBooks API)
Decisions: milestones where status = 'awaiting-client'

### Interactions that must work

- Navigate all pages via sidebar
- Create client (modal → adds to list → toast)
- Create project with template selector
- Toggle milestone checkbox (updates progress %)
- Categorize photo from queue
- Upload invoice with 8 fields
- Change invoice status inline
- CRUD membership tiers in settings

### Tailwind v4 note

This project uses Tailwind v4, so brand tokens live in `src/app/globals.css` via `@theme`
(not `tailwind.config.ts`). Any new design token should be added there; it becomes a utility
class automatically (e.g. `--color-brand-teal-500` → `bg-brand-teal-500`).
