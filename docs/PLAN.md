# Insight HM Admin Portal — Build Plan

## Completed

- [x] Project scaffold + CLAUDE.md + hooks
- [x] Sidebar + admin layout
- [x] Database schema with RLS (Supabase + Drizzle)
- [x] Auth wiring (Supabase Auth + middleware + login page + profile trigger + invite flow)

## In progress

- [ ] Replace mock-data on dashboard with real queries

## Next up

- [ ] Migrate remaining pages to real data
- [ ] File uploads to Supabase Storage (photos, PDFs)
- [ ] Email via Postmark
- [ ] Deploy to Vercel

## Pages to build (in order)

1. [x] Project scaffold + CLAUDE.md + hooks
2. [x] Layout + Sidebar (teal header, white body)
3. [ ] Dashboard (stat cards, today's schedule, alerts, activity log)
4. [ ] Clients list page
5. [ ] Client detail page (property switcher, 7 tabs)
6. [ ] Schedule page (today/week/month views)
7. [ ] Photo queue page (bulk categorize)
8. [ ] Decisions page (urgency-sorted list)
9. [ ] Invoices page (cross-client, inline status edit)
10. [ ] Vendors page
11. [ ] Staff page
12. [ ] Templates page
13. [ ] Settings page (company, tiers, emails, integrations)

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
