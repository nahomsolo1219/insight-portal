# Insight HM — Design System

A practical reference for everyone building UI across the three surfaces of this app:
**admin** (`/admin/*`), **client portal** (`/portal/*`), and **field staff** (`/field/*`).

The three surfaces share a brand identity but diverge in visual language. As of the
client-portal redesign (Phase 0, see [Surface map](#surface-map) below), they each pull
from a partially-overlapping set of tokens — read the surface labels carefully when
choosing what to apply.

This document describes **what exists in the codebase today** — verbatim Tailwind class
strings, real file paths, and concrete props. Anything aspirational is in the
[Polish List](#polish-list) at the end. New UI work must conform to this system; if
something here feels wrong, fix the system (and this doc) in the same change rather
than introducing a one-off.

Tailwind v4 is configured via `@theme` in [src/app/globals.css](../src/app/globals.css) — every CSS
variable there becomes a utility class automatically (`--color-brand-teal-500` →
`bg-brand-teal-500`, `text-brand-teal-500`, `border-brand-teal-500`). A separate
`:root` block holds CSS variables that are deliberately NOT registered as Tailwind
utilities (most client-portal numeric scales — see the [Client-only](#client-only)
section for why).

---

## Surface map

| Surface | Page background | Body font | Display font | Brand teal scale | Brand accent scale | Card shadow | Notes |
|---|---|---|---|---|---|---|---|
| **Admin** (`/admin/*`) | `bg-cream` | Inter | none | `brand-teal-{50..700}` | `brand-gold-{50..600}` | `shadow-soft-md` | Information-dense, table-heavy. |
| **Client** (`/portal/*`) | `bg-cream` | Inter | none | Bare `--teal-{50,700,800,900}` | Bare `--amber-{50,100,500,600}` | `shadow-soft-md` | Editorial, photo-driven. |
| **Field** (`/field/*`) | `bg-gray-50` (flagged) | Inter | none | `brand-teal-{50..700}` | `brand-gold-{50..600}` | `shadow-card` | Mobile-first, ≥44px tap targets. Inherits admin tokens today. |

**Inter only.** All three surfaces use Inter for everything — body and
editorial. Page titles and hero headlines compose `font-light` +
`tracking-tight` (and `tracking-tighter` at the very largest sizes —
the negative tracking compensates for the optical density a serif
used to carry at 4xl+). Earlier phases of the redesign loaded Fraunces
(client portal) and DM Serif Display (admin); both were removed to
conform to the client brand spec, which is Helvetica Neue / Inter only.

**Mental model:** if you're touching a file under `src/app/admin/**` or
`src/app/field/**`, reach for the `brand-teal-*` / `brand-gold-*` scales
below. If you're touching `src/app/portal/**`, reach for `bg-cream` /
`text-ink-700` / `shadow-soft-md` and the bare `--teal-*` / `--amber-*` /
chip-color CSS variables.

---

## Design Tokens

### Colors

All canonical colors live in `globals.css` `@theme` (or, for the client-portal-only
scales, in the `:root` block beside it). Reach for them via Tailwind utilities or
`var()` references — never paste hex codes into JSX.

#### Admin + field

**Primary teal** (sidebar header, page titles, primary actions) — admin + field:

| Token | Hex | Typical use |
|---|---|---|
| `brand-teal-50` | `#EEF5F6` | Card tints, hover backgrounds |
| `brand-teal-100` | `#D5E8EB` | Borders on active nav |
| `brand-teal-200` | `#A8D0D6` | Focus rings |
| `brand-teal-300` | `#6BADB8` | Hover-state borders |
| `brand-teal-400` | `#2D7F8C` | Focus borders |
| `brand-teal-500` | `#1B4F5A` | Primary teal — sidebar header, page titles, secondary CTAs |
| `brand-teal-600` | `#164149` | Active button states |
| `brand-teal-700` | `#113338` | (Reserved — not currently used) |

**Accent gold** (one primary CTA per section, badges):

| Token | Hex | Typical use |
|---|---|---|
| `brand-gold-50` | `#FBF6EE` | Stat-card icon tints, gold accents on cards |
| `brand-gold-100` | `#F5E8D0` | Decision-badge background |
| `brand-gold-200` | `#EBCFA0` | Hover border for gold actions |
| `brand-gold-300` | `#DFB26A` | (Reserved) |
| `brand-gold-400` | `#C8963E` | Primary CTA fill — "Add client", "Save", "Upload" |
| `brand-gold-500` | `#A87B2F` | CTA hover, decision-badge text |
| `brand-gold-600` | `#886223` | (Reserved) |

**Warm neutrals** (backgrounds, dividers):

| Token | Hex | Typical use |
|---|---|---|
| `brand-warm-50` | `#FDFCFA` | Modal footers, hover tints |
| `brand-warm-100` | `#F9F9F7` | Page background (admin + portal) |
| `brand-warm-200` | `#F3F2EE` | Pill-tab containers, empty-state icon backgrounds |
| `brand-warm-300` | `#E8E6E1` | Sidebar border, dividers |
| `brand-warm-400` | `#D4D2CC` | (Reserved) |

**Supporting**:

| Token | Hex | Use |
|---|---|---|
| `brand-nav-active` | `#F4F8F9` | Active sidebar nav row tint (set via `bg-[color:var(--color-brand-nav-active)]`) |

**Body text colors** (declared as CSS vars in `:root`, currently used as raw hex):

- `--foreground` `#444444` — body
- `--foreground-muted` `#737373` — secondary text
- These are referenced inline as `text-[#444]` and `text-[#737373]` today — see polish list.

**Status / semantic colors** (Tailwind defaults, admin + field — pills and feedback):

| Tone | Background | Text | Used for |
|---|---|---|---|
| Success | `bg-emerald-50` | `text-emerald-700` | Paid invoices, completed milestones, approved photos |
| Warning | `bg-amber-50` | `text-amber-700` | Partial invoices, pending photos, in-progress |
| Danger | `bg-red-50` | `text-red-600` / `text-red-700` | Unpaid, errors, destructive actions |
| Info | `bg-blue-50` | `text-blue-700` | Scheduled appointments, informational |
| Decision | `bg-brand-gold-50` | `text-brand-gold-700` | Awaiting client response |

#### Client-only

The client-portal redesign (started in Phase 0) introduces a parallel set of tokens
for the editorial aesthetic — cream paper, hairline rules, soft drop shadows, ink
greys instead of admin's warm-100 / `text-[#444]`. Most are accessible as Tailwind
utilities (`bg-cream`, `text-ink-700`, etc.); the numeric brand scales are bare
CSS variables only (`var(--teal-700)`, `var(--amber-500)`) so they don't clobber
admin's existing `brand-teal-*` scale or Tailwind's default `teal-*`/`amber-*`/`rose-*`
namespaces.

**Surfaces** (Tailwind utilities) — applied to `<div>`/`<body>`/`<section>`:

| Token | Hex | Utility | Use |
|---|---|---|---|
| `--color-paper` | `#FFFFFF` | `bg-paper` | Card surfaces sitting on cream |
| `--color-cream` | `#FBF8F1` | `bg-cream` | Section/header backgrounds; default page background once Phase 1 ships |
| `--color-ivory` | `#F7F4ED` | `bg-ivory` | Outermost portal page background |
| `--color-line` | `#E8E2D4` | `border-line` | Primary hairline (card borders, dividers) |
| `--color-line-2` | `#EFE9DB` | `border-line-2` | Softer hairline (sub-section dividers) |

**Ink scale** (Tailwind utilities) — softer than pure black, calibrated for cream:

| Token | Hex | Utility | Use |
|---|---|---|---|
| `--color-ink-900` | `#1A1F1E` | `text-ink-900` | Headings, primary text |
| `--color-ink-700` | `#3C4543` | `text-ink-700` | Body text |
| `--color-ink-500` | `#6B7370` | `text-ink-500` | Secondary text, eyebrows |
| `--color-ink-400` | `#8C9290` | `text-ink-400` | Tertiary text, hints |
| `--color-ink-300` | `#B5B8B5` | `text-ink-300` | Disabled / placeholder |

**Brand teal — client portal scale** (bare CSS vars, *parallel* to `brand-teal-*`).
Use via `var(--teal-700)` in inline styles or composed class names. **Do not
substitute `brand-teal-*` here** — the values are different and serve a different
visual role.

| Token | Hex | Use |
|---|---|---|
| `--teal-50` | `#E8F0EF` | Tint for hairline cards |
| `--teal-700` | `#1A6863` | Primary editorial teal |
| `--teal-800` | `#14504C` | Hover / pressed |
| `--teal-900` | `#0E3A38` | Heading accents, deepest teal |

**Brand amber — client portal scale** (bare CSS vars, *parallel* to `brand-gold-*`):

| Token | Hex | Use |
|---|---|---|
| `--amber-50` | `#FAF4E5` | Subtle amber tints on cream |
| `--amber-100` | `#F4E9D2` | Eyebrow underlines, decision-card glow |
| `--amber-500` | `#C99A3F` | Primary amber accent |
| `--amber-600` | `#B8862E` | Hover / pressed amber |

**Status chip palette** (bare CSS vars) — softer than the admin Tailwind-default
status colors. Used for editorial chips on the client portal:

| Token | Hex | Pair with | Used for |
|---|---|---|---|
| `--rose-100` / `--rose-700` | `#F4E4E0` / `#8B3D2E` | Background / text | Overdue, attention-needed |
| `--green-100` / `--green-700` | `#DCEAE0` / `#2E6B4A` | Background / text | Paid, complete, on-track |
| `--blue-100` / `--blue-700` | `#DDE6EE` / `#2D4F70` | Background / text | Informational, scheduled |

### Typography

Inter for everything. Page titles, hero headlines, and stat numerals
compose `font-light` + `tracking-tight` (and `tracking-tighter` at the
very largest sizes — 4xl and up — where the negative tracking
compensates for the optical density a serif used to carry); body text
is the default Inter at normal weight. Italics keep the Inter italic
face at light weight for the editorial subtitles.

- **Inter** (sans, 300/400/500/600/700, normal + italic) → CSS var
  `--font-inter` → utility `font-sans`. Used across all three surfaces.
- **DM Serif Display** is loaded but no longer applied; removing the
  font-loading entry is a separate cleanup.

Earlier phases of the redesign loaded a display serif (Fraunces on
the client portal, DM Serif Display on the admin pages). Both were
removed to conform to the client brand spec — Helvetica Neue / Inter
only — and the editorial feel now comes entirely from Inter at light
weight + tightened tracking at large sizes.

#### Client-only utility class

The client portal still uses one global CSS class (`.eyebrow`) that
bakes in tracking and weight values too specific to express via
Tailwind atoms.

```css
.eyebrow {
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--color-ink-500);
  font-weight: 500;
}
```

`<span className="eyebrow">` for the all-caps section labels above
editorial cards. The class is **client-portal only** — using it on
admin or field would break the information-density contract those
surfaces hold. Page titles and hero headlines are pure Tailwind:

```jsx
<h1 className="text-ink-900 text-3xl font-light tracking-tight">Dashboard</h1>
<h1 className="text-ink-900 text-4xl font-light tracking-tighter md:text-5xl">Welcome back, Nahom.</h1>
```

Sizes in actual use:

| Tailwind | Pixels | Used for |
|---|---|---|
| `text-[9px]` | 9 | Badge counts (red dots) |
| `text-[10px]` | 10 | Section labels (`SECTION_NAME` uppercase tracked), bottom-tab labels |
| `text-[11px]` | 11 | Status badges, secondary meta, eyebrow rule labels |
| `text-xs` | 12 | Card meta lines, secondary text |
| `text-sm` | 14 | Body, nav labels, button text |
| `text-base` | 16 | Card titles, primary text |
| `text-lg` | 18 | Hero stat values on tablet |
| `text-xl` | 20 | Modal titles, stat values on cards |
| `text-2xl` | 24 | Stat-card numbers (`font-light tracking-tight`), portal page titles on mobile |
| `text-3xl` | 30 | Page titles (`font-light tracking-tight`) |
| `text-4xl` / `text-5xl` | 36 / 48 | Client-portal hero headlines (`font-light tracking-tighter`) |

Weights:

- `font-light` — large stat numbers, hero values (premium feel at large size)
- `font-normal` — default body
- `font-medium` — interactive text, buttons, nav labels
- `font-semibold` — card titles, modal titles, active nav labels
- `font-bold` — `INSIGHT` brand wordmark only (uppercase + tracking)

### Spacing scale

Standard Tailwind scale. Patterns in actual use:

- Card padding: **`p-6`** for full cards, `p-5` for compact cards, `p-4` for tight rows, `p-8`/`p-10`/`p-12` for empty states.
- Form field gap: `space-y-4` or `space-y-5` between fields.
- Section gap on a page: `space-y-6` or `space-y-8`.
- Button padding: **`px-5 py-2.5`** for primary CTAs, `px-4 py-2` for secondary, `px-3 py-1.5` for inline controls.

### Border radii

#### Admin + field

Tailwind's defaults — no custom radii on these surfaces.

| Class | Pixels | Used for |
|---|---|---|
| `rounded-md` | 6 | Status pills, small badges |
| `rounded-lg` | 8 | Sidebar nav rows, dropdowns, icon-only buttons |
| `rounded-xl` | 12 | Buttons, inputs, secondary cards, popovers |
| `rounded-2xl` | 16 | **Standard cards** (the canonical card radius) |
| `rounded-3xl` | 24 | Modal containers only |
| `rounded-full` | 9999 | Avatars, status pills, badge dots, FAB |

#### Client-only

Bare CSS variables — apply via `style={{ borderRadius: 'var(--r-md)' }}` or compose
into custom Tailwind utilities later. The 10px rung is unique to client (no Tailwind
default match), the others align with `rounded-md` / `rounded-2xl` / `rounded-3xl`.

| Token | Pixels | Use |
|---|---|---|
| `--r-sm` | 6 | Inline chips, subtle pill buttons |
| `--r-md` | 10 | Photo cards, list-item containers |
| `--r-lg` | 16 | Editorial cards (canonical client radius) |
| `--r-xl` | 24 | Hero / modal surfaces |

### Shadows

#### Admin + field

Custom tokens defined in `globals.css`. Don't use Tailwind's default `shadow-*` —
prefer these:

| Token | Definition | Used for |
|---|---|---|
| `shadow-soft` | `0 1px 3px rgba(0,0,0,.04), 0 1px 2px rgba(0,0,0,.03)` | Buttons, subtle pills |
| `shadow-card` | `0 2px 8px rgba(0,0,0,.04), 0 1px 2px rgba(0,0,0,.02)` | **Standard card shadow** |
| `shadow-elevated` | `0 4px 16px rgba(0,0,0,.06), 0 2px 4px rgba(0,0,0,.03)` | Popovers, FAB, hover-elevation |
| `shadow-modal` | `0 24px 48px rgba(0,0,0,.12), 0 8px 16px rgba(0,0,0,.06)` | Modals, top-level dropdowns |

#### Client-only

Softer drop shadows tuned for cream paper backgrounds — ink-tinted (`rgba(20,30,28,…)`)
rather than pure black, slightly larger blur radius. Apply as Tailwind utilities:

| Token | Utility | Use |
|---|---|---|
| `--shadow-soft-sm` | `shadow-soft-sm` | Subtle pills, hairline cards on cream |
| `--shadow-soft-md` | `shadow-soft-md` | **Standard client-portal card shadow** |
| `--shadow-soft-lg` | `shadow-soft-lg` | Lifted hero / modal surfaces |

### Press feedback (global)

Defined once in `globals.css`. Every `<button>`, `<a href>`, `[role="button"]`,
`<select>`, `<summary>`, and `<label for>` automatically gets:

- `cursor: pointer` (and `not-allowed` when disabled)
- A short transform/color/shadow transition
- `transform: scale(0.97)` on `:active` (subtler `scale(0.98)` on `nav a/button`)
- `[role="tab"]` and `[data-tab]` get a faster background blush on press.

Don't fight this — never set `cursor-pointer` manually, and don't add custom `:active`
transforms.

---

## Layout Patterns

> The patterns in this section describe **admin** and the **current** client portal
> + field surfaces. The client-portal redesign (Phase 1+) will replace `PortalNav`
> and the portal layout chrome with editorial equivalents — those will be documented
> here as they ship. Admin and field stay on these patterns.

### Three layouts

| Layout | File | Container | Background | Notes |
|---|---|---|---|---|
| Admin | [src/app/admin/layout.tsx](../src/app/admin/layout.tsx) | `max-w-[1200px] px-8 py-8` | `bg-brand-warm-100` | `h-screen overflow-hidden flex` — sidebar fixed, main area scrolls independently. |
| Portal | [src/app/portal/layout.tsx](../src/app/portal/layout.tsx) | `max-w-[900px] px-6 pt-10 pb-24 md:pb-10` | `bg-brand-warm-100` | Narrower column = "concierge" feel. `pb-24` clears the mobile bottom-tab bar. |
| Field | [src/app/field/layout.tsx](../src/app/field/layout.tsx) | Full-bleed | `bg-gray-50` (intentional — see polish) | Mobile-first; teal header band uses `safe-area-top`, main uses `safe-area-bottom`. |

The root [src/app/layout.tsx](../src/app/layout.tsx) sets the body to `bg-brand-warm-100 min-h-full text-[#444] antialiased`
and loads the two fonts.

### Admin sidebar

[src/components/admin/Sidebar.tsx](../src/components/admin/Sidebar.tsx)

```
border-brand-warm-300 flex h-full w-64 flex-shrink-0 flex-col border-r bg-white
```

Three vertical bands:

1. **Header** — `bg-brand-teal-500 px-5 py-5`. White SVG logo `h-9 w-auto`.
2. **Body** — search input + scrollable nav. Section labels: `mb-2 px-3 text-[10px] font-semibold tracking-[0.14em] text-[#a3a3a3] uppercase`.
3. **Footer** — `border-brand-warm-300 flex items-center gap-3 border-t px-4 py-3`. Avatar (`h-9 w-9 rounded-lg bg-brand-teal-500`) + name + sign-out.

Nav row classes:

```
flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors
```

| State | Classes |
|---|---|
| Inactive | `text-[#555] border border-transparent hover:bg-brand-warm-100 hover:text-brand-teal-500` |
| Active | `text-brand-teal-500 border-brand-teal-100 border bg-[color:var(--color-brand-nav-active)] font-medium` |

Active is a **light teal tint with a subtle border** — no left-border accent (per the
"Design rules" in CLAUDE.md). Sidebar badges are gold pills:
`bg-brand-gold-400 min-w-[18px] rounded-full px-1.5 py-0.5 text-center text-[10px] font-semibold text-white`.

### Portal navigation

[src/components/portal/PortalNav.tsx](../src/components/portal/PortalNav.tsx) — single source `NAV_LINKS` drives both surfaces.

**Top bar** (`md+` only):

```
sticky top-0 z-40 border-b border-gray-100 bg-white
mx-auto flex max-w-[1100px] items-center gap-8 px-6 py-3
```

Logo block: `h-8 w-8 rounded-lg bg-brand-teal-500` containing a 16×16 white SVG, plus
`text-brand-teal-500 text-sm font-bold tracking-wider` "INSIGHT".

Top-nav link:

```
relative rounded-lg px-3 py-2 text-sm font-medium transition-colors
```

Inactive: `text-gray-500 hover:text-brand-teal-500`.
Active: `text-brand-teal-500` plus a 2px underline pseudo-element:
`bg-brand-teal-500 absolute right-3 -bottom-3 left-3 h-0.5 rounded-full`.

**Bottom tabs** (mobile, `md:hidden`):

```
fixed right-0 bottom-0 left-0 z-40 border-t border-gray-100 bg-white md:hidden
ul: grid grid-cols-5
```

Tab cell: `flex flex-col items-center justify-center gap-0.5 py-2`. Icon size `20`,
label `text-[10px]` (`font-semibold` when active, `font-medium` otherwise).

**Badge dots**: `inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white`.
On the desktop top-nav they sit inline (`ml-1.5`); on mobile tabs they float on the icon corner with a `ring-2 ring-white`.

### Field header

[src/app/field/layout.tsx](../src/app/field/layout.tsx)

- Header: `bg-brand-teal-500 safe-area-top text-white` containing `flex items-center justify-between px-4 py-3`.
- Logo: 20×20 SVG + `text-sm font-bold tracking-wider` "INSIGHT".
- Sign-out: `inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-white/60 hover:bg-white/10 hover:text-white`.
- Main: `safe-area-bottom flex-1 overflow-y-auto`.

`.safe-area-top` and `.safe-area-bottom` are utilities from `globals.css` that pad
for the iPhone notch / home bar via `env(safe-area-inset-*)`.

### Page header pattern (admin)

The admin convention — followed in [clients](../src/app/admin/clients/page.tsx),
[vendors](../src/app/admin/vendors/page.tsx), [staff](../src/app/admin/staff/page.tsx),
[projects/[id]](../src/app/admin/projects/[id]/page.tsx) and others — is:

- Title: `font-display text-brand-teal-500 text-3xl tracking-tight`. **Always teal, always `text-3xl`, always `font-display`.**
- Subtitle (count or context): `mt-1 text-sm text-gray-500` (or `text-[#737373]`).
- Action (typically a gold CTA) on the same row, right-aligned via `flex justify-between` or via a separate client component slot underneath the header.

Back-link convention (used on detail pages):

```tsx
<Link
  href={...}
  className="hover:text-brand-teal-500 mb-4 inline-flex items-center gap-1 text-sm text-gray-500 transition-colors"
>
  <ChevronLeft size={16} strokeWidth={1.5} />
  Back to {parentName}
</Link>
```

Portal page titles use a **responsive** variant — see [polish list](#polish-list).

### Tab navigation (two flavours)

Two distinct tab styles coexist — match whichever is appropriate to the surface, but
never invent a third.

**Pill-tab style** (used on [client detail](../src/app/admin/clients/[id]/ClientDetailTabs.tsx) — many tabs,
horizontal scroll):

```
container: bg-brand-warm-200 mb-6 inline-flex max-w-full gap-1 overflow-x-auto rounded-xl p-1
tab base:  inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium whitespace-nowrap transition-all
inactive:  text-gray-500 hover:text-brand-teal-500
active:    text-brand-teal-500 shadow-soft bg-white
```

The active tab is a white pill with `shadow-soft` floating above the warm container.

**Underline-tab style** (used on [project detail](../src/app/admin/projects/[id]/ProjectDetailClient.tsx) — few
tabs, denser):

```
container: mb-6 flex items-center gap-1 border-b border-gray-100
tab base:  relative inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors
inactive:  text-gray-500 hover:text-brand-teal-500
active:    text-brand-teal-500
underline: bg-brand-teal-500 absolute right-3 -bottom-px left-3 h-0.5 rounded-full
```

This is also the pattern used on the desktop portal nav links.

### Property switcher

[ClientDetailTabs.tsx](../src/app/admin/clients/[id]/ClientDetailTabs.tsx) handles three branches above the tab bar:

| Properties | Render |
|---|---|
| 0 | `<AddPropertyButton variant="cta">` — full empty-state card prompting first property. |
| 1 | `<MapPin>` icon + `address, city, state` joined by commas + small inline `+ Add property` pill. |
| 2+ | Horizontal scroll row of property pills. Active pill: `bg-brand-teal-50 text-brand-teal-500 border-brand-teal-500/10 border`; inactive: `text-gray-500 hover:text-brand-teal-500 hover:bg-brand-warm-50`. |

---

## Component Primitives

Everything in `src/components/admin/` and `src/components/portal/`. **`admin/` is a
historical name — these primitives are reusable across all three surfaces.** The
portal already imports `Field`, `inputClass`, `Modal`, `LoadingDots`, and `ToastProvider`
from `@/components/admin/*`.

> **Surface scope:** Every primitive below is admin-style today. The client-portal
> redesign (Phase 1+) will introduce editorial-styled primitives that compose the
> client tokens (`bg-cream`, `text-ink-700`, `.serif`, `shadow-soft-md`, the
> chip-color palette). Until those land, the existing admin primitives are the
> canonical primitives for the redesigned portal as well — flag any new
> client-portal component patterns here as they ship.

### Buttons

**No shared `<Button />` component exists.** Every page rolls its own using the
class strings below. See the polish list — extracting a shared component is a known
follow-up.

The four canonical variants:

| Variant | Class string | Used for |
|---|---|---|
| **Primary CTA (gold)** | `bg-brand-gold-400 hover:bg-brand-gold-500 shadow-soft inline-flex items-center gap-2 rounded-xl px-5 py-2.5 font-medium text-white transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50` | The one main action per section: "Add client", "Save changes", "Upload photos". One per section maximum. |
| **Secondary (teal-filled)** | `bg-brand-teal-500 hover:bg-brand-teal-600 shadow-soft rounded-xl px-5 py-2.5 font-medium text-white transition-all` | Confirm dialogs, Modal confirms that aren't destructive. |
| **Secondary (teal-outline)** | `text-brand-teal-500 border-brand-teal-200 hover:border-brand-teal-300 hover:bg-brand-teal-50 inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-medium transition-all` | Inline actions like "Preview", "Add to calendar", "Download all". |
| **Ghost / Cancel** | `rounded-xl px-5 py-2.5 font-medium text-gray-700 transition-all hover:bg-gray-100 disabled:opacity-50` | Cancel buttons inside modals; secondary "Close". |
| **Destructive (filled red)** | `shadow-soft rounded-xl bg-red-500 px-5 py-2.5 font-medium text-white transition-all hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50` | Confirmed delete actions. |
| **Destructive (text)** | `inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-medium text-red-500 transition-all hover:bg-red-50` | Delete trigger before the confirm modal opens. |

Buttons that include a leading icon use Lucide icons at `size={14}` (most), `size={16}` (toolbar), or `size={18}` (floating actions). Stroke widths typically `1.5` for outlined, `1.75` or `2` for emphasis.

When showing async state, swap label text to a present-progressive verb plus
`<LoadingDots />`:

```tsx
{isPending ? <>Saving<LoadingDots /></> : 'Save changes'}
```

### Cards

**No shared `<Card />` component.** The canonical class string is:

```
shadow-card rounded-2xl bg-white p-6
```

Common variants:

- Compact list rows: drop to `p-5` or `p-4`.
- Empty states: bump to `p-8`, `p-10`, or `p-12` and centre the content.
- Headerless white-on-white sections: drop the shadow, keep `rounded-2xl bg-white`.
- Elevated popovers/dropdowns: `shadow-elevated rounded-xl bg-white`.

Tone: **never use a visible border unless emphasising a state** (e.g. decision
milestones get `border-brand-gold-300 border`). Borders that wrap an entire card add
visual noise; rely on shadow + rounded radius.

### Stat cards

[src/components/admin/StatCard.tsx](../src/components/admin/StatCard.tsx)

```ts
interface StatCardProps {
  label: string;
  value: string | number;
  trend?: string;
  trendColor?: 'green' | 'amber' | 'gray';
  valueColor?: 'default' | 'amber';
  icon?: LucideIcon;
  iconTone?: 'teal' | 'gold';
  className?: string;
}
```

Container: `shadow-card flex flex-col gap-3 rounded-2xl bg-white p-6`.
Value typography: `text-4xl leading-none font-light tracking-tight` — the **light
weight at large size** is the premium feel. Don't bold stat numbers.

Some pages render their own inline stat cards instead of using this component (see
polish list) — e.g. project detail uses `text-2xl font-light tracking-tight tabular-nums`.

### Status badges

[src/components/admin/StatusBadge.tsx](../src/components/admin/StatusBadge.tsx)

```ts
interface StatusBadgeProps {
  label?: string;
  status?: string;        // looked up in STATUS_MAP
  tone?: 'teal' | 'gold' | 'green' | 'amber' | 'red' | 'neutral' | 'blue';
  className?: string;
}
```

Container: `inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium tracking-wide` plus tone classes.

Tones (the tinted-background pattern — never use saturated pills):

| Tone | Classes |
|---|---|
| green | `bg-emerald-50 text-emerald-700` |
| amber | `bg-amber-50 text-amber-700` |
| red | `bg-red-50 text-red-600` |
| blue | `bg-blue-50 text-blue-700` |
| gold | `bg-brand-gold-100 text-brand-gold-700` |
| teal | `bg-brand-teal-50 text-brand-teal-500` |
| neutral | `bg-gray-100 text-gray-600` |

`status` is mapped via the component's internal `STATUS_MAP` to label + tone for
known DB statuses (`scheduled`, `confirmed`, `paid`, `unpaid`, `awaiting_client`,
`in_progress`, `complete`, etc.). Use `status` whenever you have a DB enum value and
`label`+`tone` only when you need a one-off pill.

### Modal

[src/components/admin/Modal.tsx](../src/components/admin/Modal.tsx)

```ts
interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';     // max-w-md / max-w-lg / max-w-2xl
  locked?: boolean;               // disables Esc + backdrop click while a mutation is in flight
}
```

Backdrop: `fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm`.
Container: `shadow-modal flex max-h-[85vh] w-full flex-col overflow-hidden rounded-3xl bg-white`.
Header: `border-b border-gray-100 px-8 py-6`. Title `text-xl font-semibold text-gray-900`.
Body: `flex-1 overflow-y-auto px-8 py-6`.
Footer: `bg-brand-warm-50 flex items-center justify-end gap-3 border-t border-gray-100 px-8 py-5`.

Built-in: ESC closes, backdrop click closes, body scroll-lock while open.

### Toast / ToastProvider

[src/components/admin/ToastProvider.tsx](../src/components/admin/ToastProvider.tsx) — wraps the app (admin layout
mounts it; portal layout mounts it too — required for `useToast()`).

```ts
const { showToast } = useToast();
showToast('Client created');           // success (default)
showToast('Failed to delete', 'error');
showToast('Heads up', 'info');
```

Container: `fixed right-6 bottom-6 z-[200] flex flex-col gap-2`. Each toast:
`shadow-elevated flex max-w-sm items-start gap-3 rounded-xl border bg-white px-4 py-3` plus tone-specific border (`emerald-200` / `rose-200` / `sky-200`). Auto-dismiss after 4s.

### Form fields

[src/components/admin/Field.tsx](../src/components/admin/Field.tsx) — wrapper + two exported class constants.

```ts
<Field label="Name" required hint="Optional helper text.">
  <input className={inputClass} ... />
  <textarea className={textareaClass} ... />
</Field>
```

`inputClass`:

```
w-full px-4 py-3 rounded-xl border border-gray-200 text-sm
focus:ring-2 focus:ring-brand-teal-200 focus:border-brand-teal-400
outline-none transition-all bg-white
```

`textareaClass` is `inputClass` plus `resize-none`.

Label: `mb-2 block text-xs font-semibold tracking-wider text-gray-500 uppercase`.
Hint: `mt-1.5 text-xs text-gray-400`.

For native `<select>`, apply `inputClass` directly. For `<input type="date">` /
`type="email"` / `type="tel"`, also `inputClass`.

### File upload (drag/drop)

[src/components/admin/FileUpload.tsx](../src/components/admin/FileUpload.tsx)

```ts
<FileUpload
  kind="image"           // 'pdf' | 'image' | 'any'
  multiple
  maxFiles={40}
  onChange={setFiles}
  disabled={isPending}
/>
```

The component **stages files only** — the parent form posts them to a Server Action
via `FormData`. Drop zone styling:

```
relative cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition-all
inactive: hover:border-brand-teal-300 bg-brand-warm-50 border-gray-200
active:   border-brand-teal-400 bg-brand-teal-50
```

### Avatar upload

[src/components/admin/AvatarUpload.tsx](../src/components/admin/AvatarUpload.tsx)

Sizes: `sm` (h-10), `md` (h-14), `lg` (h-20). Displays signed image or initials fallback on `bg-brand-teal-500`. Click opens a file picker; `onUpload` receives a `FormData`.

### Dropdown

[src/components/admin/Dropdown.tsx](../src/components/admin/Dropdown.tsx) — anchored via `@floating-ui/react`, supports color-coded badges + checkmark on the selected option. Menu: `shadow-modal z-[100] min-w-[160px] overflow-hidden rounded-xl border border-gray-100 bg-white py-1`. Item: `flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-gray-50`.

### Progress bar

[src/components/admin/ProgressBar.tsx](../src/components/admin/ProgressBar.tsx)

Track: `bg-brand-warm-200 h-1.5 flex-1 overflow-hidden rounded-full`. Fill: `bg-brand-teal-500` (default) or `bg-brand-gold-400` (`tone="gold"`). 1.5px track keeps the bar feeling light — never use thicker bars.

### Loading affordances

| Primitive | When to use |
|---|---|
| [LoadingDots](../src/components/admin/LoadingDots.tsx) | Inline inside a button while a mutation runs. Inherits color via `bg-current`. |
| [Skeleton](../src/components/admin/Skeleton.tsx) (`SkeletonLine` / `SkeletonCard` / `SkeletonTable` / `SkeletonGrid`) | Page-level `loading.tsx` files (Next.js convention). |
| [NavigationProgress](../src/components/admin/NavigationProgress.tsx) | Mounted globally — thin gold bar across the top while a navigation is in flight. Don't add another. |

### Photo review panel

[src/components/admin/PhotoReviewPanel.tsx](../src/components/admin/PhotoReviewPanel.tsx) — desktop side-panel for the
admin photo review flow. Mobile keeps the full-screen modal. Shared between Photo
Queue and the client-detail Photos tab. Keyboard shortcuts: `←/→` navigate, `1/2/3`
tag, `Enter` approve, `R` reject.

### Portal-only primitives

- [PortalNav](../src/components/portal/PortalNav.tsx) — covered above.
- [ContactFab](../src/components/portal/ContactFab.tsx) — bottom-right floating action button for client → PM contact. `bottom-20 md:bottom-6 right-4 md:right-6`.
- [PdfViewer](../src/components/portal/PdfViewer.tsx) — iframe-based PDF preview modal for documents and invoices.
- [ComingSoonCard](../src/components/portal/ComingSoonCard.tsx) — placeholder for unshipped portal sections.

### Tables

**No shared Table component.** The convention used on the admin client list,
vendors list, vendor detail, etc.:

```html
<div className="shadow-card overflow-hidden rounded-2xl bg-white">
  <div className="overflow-x-auto">
    <table className="w-full">
      <thead>
        <tr className="border-b border-gray-100">
          <th className="px-4 py-3 text-xs font-medium tracking-wider text-gray-400 uppercase text-left">…</th>
        </tr>
      </thead>
      <tbody>
        <tr className="hover:bg-brand-warm-50 border-b border-gray-50 transition-colors last:border-b-0">
          <td className="px-4 py-4 text-sm">…</td>
        </tr>
      </tbody>
    </table>
  </div>
</div>
```

**No alternating row colors.** Generous padding (`px-4 py-4` minimum). Warm hover.

### Empty states

**No shared component.** Two prevailing styles:

- **Admin**: `shadow-card rounded-2xl bg-white p-12 text-center` with a circle icon container (`bg-brand-warm-200 mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full text-gray-400`), title `text-base font-semibold text-gray-900`, body `mx-auto mt-2 max-w-sm text-sm text-gray-500`, and an optional CTA below.
- **Portal**: same structure, but some pages skip the card and render plain text. See polish list.

---

## Cross-Surface Density Rules

The same token system spans three surfaces with very different density targets:

| Surface | Vibe | Affordance density | Container | Card padding |
|---|---|---|---|---|
| **Admin** | Information-dense ops dashboard | Many actions per screen, dropdowns and dropdowns of tools, table-heavy | `max-w-[1200px]` | `p-5` / `p-6` |
| **Portal** | Calm concierge experience | One or two primary actions per screen, hide internal complexity | `max-w-[900px]` | `p-5` / `p-6`, more whitespace between sections (`space-y-8`+) |
| **Field** | One-thumb mobile capture | Big tap targets, minimal chrome, full-bleed | Full width | Compact, but every interactive element ≥ 44px tall |

A few specific principles:

- **Buttons widen on mobile**: portal/field forms use `h-11` or `h-12` full-width buttons; admin uses inline `px-5 py-2.5` buttons. Both heights count as "primary CTA".
- **Field-staff text targets bias upward**: 44px touch-target minimum, body text usually `text-base` (16px) instead of `text-sm`.
- **Portal hides internal taxonomies**: a milestone status of `awaiting_client` shows on the client side as "Decision needs your input" via `StatusBadge status=...` — never expose the raw enum string.
- **One gold CTA per section** (admin guideline) becomes **one gold CTA per screen** in the portal. The field surface uses a single gold CTA per task (`Choose photos to upload`).
- **Brand wordmark stays the same across all three** — `INSIGHT` in `text-sm font-bold tracking-wider` next to the stylised mark, regardless of surface.

When extending: if a new pattern feels like it needs a third density level, you've
probably picked the wrong surface.

---

## Polish List

Everything below is a documented inconsistency, not a working bug. **Do not fix
these inline** — schedule a polish pass when there's a critical mass to handle in
one PR. Citations are `path:line`.

### Hardcoded body-text hex colors (should resolve to `--foreground` / `--foreground-muted` CSS vars)

The body and muted-secondary colors are declared in `globals.css` `:root` but
referenced as raw hex literals everywhere:

- [src/app/layout.tsx:33](../src/app/layout.tsx#L33) — `text-[#444]` on `<body>`
- [src/app/admin/layout.tsx:34](../src/app/admin/layout.tsx#L34) — `text-[#444]`
- [src/app/portal/layout.tsx:62](../src/app/portal/layout.tsx#L62) — `text-[#444]`
- [src/app/admin/invoices/page.tsx:23](../src/app/admin/invoices/page.tsx#L23) — `text-[#737373]` subtitle
- [src/app/admin/schedule/page.tsx:33](../src/app/admin/schedule/page.tsx#L33) — `text-[#737373]`
- [src/app/admin/staff/page.tsx:13](../src/app/admin/staff/page.tsx#L13) — `text-[#737373]`
- [src/app/admin/settings/page.tsx:16](../src/app/admin/settings/page.tsx#L16) — `text-[#737373]`
- [src/app/admin/templates/page.tsx:27](../src/app/admin/templates/page.tsx#L27) — `text-[#737373]`
- [src/app/admin/vendors/page.tsx:13](../src/app/admin/vendors/page.tsx#L13) — `text-[#737373]`

### Hardcoded one-off greys (no token; should be defined or removed)

The Sidebar and a few component primitives use grey shades that have no token:

- [src/components/admin/Sidebar.tsx:114](../src/components/admin/Sidebar.tsx#L114) — `text-[#a3a3a3]` (search icon)
- [src/components/admin/Sidebar.tsx:118](../src/components/admin/Sidebar.tsx#L118) — `placeholder-[#a3a3a3]`
- [src/components/admin/Sidebar.tsx:127](../src/components/admin/Sidebar.tsx#L127) — `text-[#a3a3a3]` (section label)
- [src/components/admin/Sidebar.tsx:143](../src/components/admin/Sidebar.tsx#L143) — `text-[#555]` (nav inactive)
- [src/components/admin/Sidebar.tsx:149](../src/components/admin/Sidebar.tsx#L149) — `text-[#8a8a8a]` (chevron)
- [src/components/admin/Sidebar.tsx:173](../src/components/admin/Sidebar.tsx#L173) — `text-[#333]` (footer name)
- [src/components/admin/Sidebar.tsx:174](../src/components/admin/Sidebar.tsx#L174) — `text-[#8a8a8a]` (footer role)
- [src/components/admin/Sidebar.tsx:180](../src/components/admin/Sidebar.tsx#L180) — `text-[#8a8a8a]` (logout)
- [src/components/admin/StatusBadge.tsx:11](../src/components/admin/StatusBadge.tsx#L11) — `text-[#555]` neutral tone
- [src/components/admin/Toast.tsx:53](../src/components/admin/Toast.tsx#L53) — `text-[#444]` toast message
- [src/components/admin/ToastProvider.tsx:107](../src/components/admin/ToastProvider.tsx#L107) — same

### No shared `<Button />` component — gold-CTA class string repeated 30+ times

These are the gold primary-CTA usages (a representative sample; the full list is
~30 files):

- [src/app/admin/clients/NewClientButton.tsx:89](../src/app/admin/clients/NewClientButton.tsx#L89)
- [src/app/admin/clients/NewClientButton.tsx:114](../src/app/admin/clients/NewClientButton.tsx#L114)
- [src/app/admin/clients/[id]/AddPropertyButton.tsx:140](../src/app/admin/clients/[id]/AddPropertyButton.tsx#L140), [:300](../src/app/admin/clients/[id]/AddPropertyButton.tsx#L300)
- [src/app/admin/clients/[id]/AppointmentsTabClient.tsx:131](../src/app/admin/clients/[id]/AppointmentsTabClient.tsx#L131), [:437](../src/app/admin/clients/[id]/AppointmentsTabClient.tsx#L437), [:549](../src/app/admin/clients/[id]/AppointmentsTabClient.tsx#L549)
- [src/app/admin/clients/[id]/PhotosTabClient.tsx:283](../src/app/admin/clients/[id]/PhotosTabClient.tsx#L283), [:705](../src/app/admin/clients/[id]/PhotosTabClient.tsx#L705), [:888](../src/app/admin/clients/[id]/PhotosTabClient.tsx#L888), [:1106](../src/app/admin/clients/[id]/PhotosTabClient.tsx#L1106), [:1283](../src/app/admin/clients/[id]/PhotosTabClient.tsx#L1283)
- [src/app/admin/projects/[id]/MilestonesTabClient.tsx:126](../src/app/admin/projects/[id]/MilestonesTabClient.tsx#L126)
- ...and ~20 more occurrences across `clients/[id]/*Tab*Client.tsx`, `staff/StaffClient.tsx`, etc.

The teal-filled secondary, the destructive-red, the ghost/cancel, and the
secondary-teal-outline patterns are similarly duplicated. Extract one
`<Button variant="primary|secondary|ghost|destructive" />` and migrate.

### No shared `<Card />` component — same class string everywhere

`shadow-card rounded-2xl bg-white p-{4|5|6|8|10|12}` is rolled inline on every page.
The padding varies by context but the shell is identical. Extract a `<Card padding="…">` primitive.

### Card padding varies for similar roles (`p-5` vs `p-6` vs `p-8`)

Per the design rules, "p-6 minimum" for cards. Real usage:

- [src/app/admin/clients/[id]/InvoicesTabClient.tsx:188](../src/app/admin/clients/[id]/InvoicesTabClient.tsx#L188) — `p-5` invoice card
- [src/app/admin/clients/page.tsx:34](../src/app/admin/clients/page.tsx#L34) — `p-5` client row
- [src/app/admin/projects/[id]/page.tsx:187](../src/app/admin/projects/[id]/page.tsx#L187) — `p-5` stat card (overrides StatCard's `p-6`)

Pick one for "row card" and one for "section card" and stick to them.

### Status badges roll their own pill on a few pages

Two pages bypass `StatusBadge` and use saturated gold pills, breaking the
"subtle tinted background, never saturated" rule:

- [src/app/admin/photo-queue/page.tsx:25](../src/app/admin/photo-queue/page.tsx#L25) — `bg-brand-gold-400 ... text-white`
- [src/app/admin/decisions/page.tsx:14](../src/app/admin/decisions/page.tsx#L14) — same pattern

Migrate both to `<StatusBadge tone="gold" label="…" />` (which uses `bg-brand-gold-100 text-brand-gold-700`).

### Stat-card variants implemented inline

- [src/app/admin/clients/[id]/InvoicesTabClient.tsx:190](../src/app/admin/clients/[id]/InvoicesTabClient.tsx#L190) — `text-2xl font-light tracking-tight` instead of using `<StatCard />`.
- [src/app/admin/projects/[id]/page.tsx:191](../src/app/admin/projects/[id]/page.tsx#L191) — `text-2xl font-light tracking-tight tabular-nums` (adds `tabular-nums` which the shared component lacks).
- [src/app/portal/page.tsx](../src/app/portal/page.tsx) — dashboard stat cards re-implemented inline.

Either widen `<StatCard />` to support `valueSize` + `tabular` props, or keep one shape only.

### Page-title sizing inconsistent across surfaces

- Admin: `font-display text-brand-teal-500 text-3xl tracking-tight` (canonical).
- Portal: `font-display text-brand-teal-500 text-2xl tracking-tight md:text-3xl` (responsive — possibly intentional).
- Field upload page (`src/app/field/upload/page.tsx`): `text-2xl font-semibold text-gray-900` — **no `font-display`, hardcoded grey**.

Decide whether field titles should use the display face. If yes, normalise. If no, document the field-specific exception.

### Field layout uses gray-50 / gray-900 instead of brand tokens

[src/app/field/layout.tsx:23](../src/app/field/layout.tsx#L23) — `flex min-h-screen flex-col bg-gray-50 text-gray-900`. Admin and portal use `bg-brand-warm-100 text-[#444]`. Either intentional ("field is a different surface") or accidental drift — confirm and document.

### Empty states inconsistent between surfaces

Admin pages render full empty-state cards with icon + title + body + CTA.
Portal pages typically render plain text inside a card without the icon/title structure:

- [src/app/portal/p/[propertyId]/appointments/page.tsx:220](../src/app/portal/p/[propertyId]/appointments/page.tsx#L220)
- [src/app/portal/p/[propertyId]/documents/page.tsx:226](../src/app/portal/p/[propertyId]/documents/page.tsx#L226)
- [src/app/portal/p/[propertyId]/invoices/page.tsx:200](../src/app/portal/p/[propertyId]/invoices/page.tsx#L200)
- [src/app/portal/p/[propertyId]/projects/page.tsx:117](../src/app/portal/p/[propertyId]/projects/page.tsx#L117)

Extract a shared `<EmptyState icon title body action?>` component.

### Inline error message pattern repeated

The "red box" inline error appears in 30+ modals and forms with the exact same classes:

```
rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600
```

Extract `<InlineError message={…} />`.

### Modal footer uses warm-50 background (intentional but undocumented)

[src/components/admin/Modal.tsx:95](../src/components/admin/Modal.tsx#L95) — `bg-brand-warm-50 ... border-t border-gray-100`. Different from the white body. Looks deliberate (visual separation of footer actions) but isn't called out anywhere; new contributors building modals from scratch wouldn't know. Document or normalise.

### Focus border varies between teal-300 and teal-400

- `Field` `inputClass` uses `focus:border-brand-teal-400`.
- [src/app/field/upload/MobilePhotoCapture.tsx:176](../src/app/field/upload/MobilePhotoCapture.tsx#L176) — `focus:border-brand-teal-300`.

Pick one focus shade.

### `useIsDesktop` hook duplicated

The same `useIsDesktop()` matchMedia hook is inlined three times:

- [src/app/admin/photo-queue/PhotoQueueClient.tsx](../src/app/admin/photo-queue/PhotoQueueClient.tsx)
- [src/app/admin/clients/[id]/PhotosTabClient.tsx](../src/app/admin/clients/[id]/PhotosTabClient.tsx)
- [src/app/admin/projects/[id]/PhotosTabClient.tsx](../src/app/admin/projects/[id]/PhotosTabClient.tsx)

Extract to `src/lib/hooks/useIsDesktop.ts`. (Per CLAUDE.md "three similar lines is better than a premature abstraction" — at three callers, we hit the threshold.)

### Type system

No `: any` or `as any` violations found in `.tsx` files — compliant with CLAUDE.md.

### No dedicated `/admin/properties/[id]` page

Properties currently exist only as expandable cards inside `EditPropertyModal`
under client detail. There's no canonical admin URL to deep-link to a property,
and operations that span multiple tabs (cover photo, projects, photos,
appointments, documents) all happen in the modal. As the redesign matures,
consider extracting a `/admin/properties/[id]` page with its own tabs so
property-scoped work stops competing with client-scoped work for the same
modal real estate.

---

## Adding new components

When you find yourself reaching for a class string that already appears in this doc,
**extract a primitive in the same change** rather than copy-pasting one more time.
Place admin-only primitives in `src/components/admin/`, portal-only in
`src/components/portal/`, and **anything used across surfaces in `src/components/admin/`** (the
historical name) — see the polish list note about renaming the directory at some point.

When you add a new primitive, update this doc in the same PR.
