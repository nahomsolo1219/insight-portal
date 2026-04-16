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

## Pages still on mock / scaffolded — migrate one at a time

- [ ] Client detail
- [ ] Schedule
- [ ] Photo queue
- [ ] Decisions
- [ ] Invoices
- [ ] Vendors
- [ ] Staff
- [ ] Templates
- [ ] Settings

## Next up

- [ ] File uploads to Supabase Storage (photos, PDFs)
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
