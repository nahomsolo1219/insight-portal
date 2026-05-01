'use client';

import {
  Bell,
  ChevronDown,
  LogOut,
  Plus,
  Search,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { DashboardNewProjectButton } from '@/app/admin/DashboardNewProjectButton';
import { NewClientButton } from '@/app/admin/clients/NewClientButton';
import type { ClientPickerRow } from '@/app/admin/queries';
import type { PmOption, TierOption } from '@/app/admin/clients/queries';
import type { NotificationListItem } from '@/app/notifications/queries';
import { NotificationsDropdown } from '@/components/admin/NotificationsDropdown';
import type { CurrentUser } from '@/lib/auth/current-user';
import { cn, initialsFrom } from '@/lib/utils';

interface AdminHeaderProps {
  user: CurrentUser;
  /** Full date label like "Tuesday, April 28, 2026" — shown at sm+. */
  dateLabel: string;
  /** Compact date like "Apr 28, 2026" — shown when the full label
   *  would crowd a narrow viewport. */
  dateLabelShort: string;
  /** Tiers + PMs power the New Client modal. */
  tiers: TierOption[];
  pms: PmOption[];
  /** Active clients drive the New Project picker modal. */
  projectPickerClients: ClientPickerRow[];
  /** Latest notifications for the bell-dropdown panel. Fetched once
   *  per request in the layout — `revalidatePath('/admin', 'layout')`
   *  in the mark-read actions keeps both this list and `unreadCount`
   *  in sync. */
  notifications: NotificationListItem[];
  unreadNotificationCount: number;
}

/**
 * Top-of-screen admin chrome. Single utility row across the full viewport:
 *
 *   [logo panel · date · search · New Client · New Project · | · bell · avatar]
 *
 * The header is intentionally title-less — every admin page renders its
 * own editorial eyebrow + h1 in the body, so duplicating the title here
 * read as visual noise. The space the title used to occupy now holds just
 * the date (server-rendered, refreshes per request).
 */
export function AdminHeader({
  user,
  dateLabel,
  dateLabelShort,
  tiers,
  pms,
  projectPickerClients,
  notifications,
  unreadNotificationCount,
}: AdminHeaderProps) {
  return (
    <header className="bg-paper border-line flex h-16 flex-shrink-0 border-b">
      {/* Logo panel — width matches sidebar so the teal block sits directly
          above where the sidebar starts. Hidden width-wise on narrow
          viewports; the logo collapses to a smaller icon-only block. */}
      <div className="bg-brand-teal-500 hidden w-64 flex-shrink-0 items-center px-6 md:flex">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo-dark.svg"
          alt="Insight Home Maintenance"
          className="h-7 w-auto"
        />
      </div>

      {/* Mobile-only narrow logo block. */}
      <div className="bg-brand-teal-500 flex w-14 flex-shrink-0 items-center justify-center md:hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo-dark.svg"
          alt="Insight"
          className="h-5 w-auto"
        />
      </div>

      {/* Header content area — everything except the logo panel. */}
      <div className="flex min-w-0 flex-1 items-center gap-4 px-4 sm:px-6">
        {/* Date label — full at sm+, abbreviated below. The page-body
            eyebrow + h1 own the editorial title; the header is utility
            chrome only. */}
        <p className="text-ink-500 hidden flex-shrink-0 text-sm sm:block">
          {dateLabel}
        </p>
        <p className="text-ink-500 flex-shrink-0 text-xs sm:hidden">
          {dateLabelShort}
        </p>

        {/* Search — flexes to fill the middle. Collapses to icon-only on
            mobile. */}
        <SearchInput />

        {/* CTAs — full labels at md+, icon-only below. */}
        <div className="flex flex-shrink-0 items-center gap-2">
          <NewClientButton tiers={tiers} pms={pms} variant="header" />
          <DashboardNewProjectButton clients={projectPickerClients} variant="header" />
        </div>

        {/* Vertical divider — separates the action cluster from the
            notifications/avatar pair. Hides on narrow viewports where
            space is tight. */}
        <span aria-hidden="true" className="bg-line hidden h-8 w-px sm:block" />

        {/* Notifications bell — wired in Session 7. Red dot only when
            unreadCount > 0; click opens the shared dropdown panel. */}
        <NotificationBell
          notifications={notifications}
          unreadCount={unreadNotificationCount}
        />

        {/* Avatar dropdown — initials + chevron, opens a small Sign out
            menu (the existing affordance from the prior sidebar footer). */}
        <AvatarMenu user={user} />
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Search input — Cmd+K affordance + global focus shortcut.
// ---------------------------------------------------------------------------

function SearchInput() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [expanded, setExpanded] = useState(false);

  // Cmd+K (or Ctrl+K) focuses the search input from anywhere in the admin.
  // Same pattern most admin tools follow; no actual search routing yet, so
  // this is purely an affordance until the search query layer ships.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setExpanded(true);
        // Defer focus until after the input renders on mobile.
        requestAnimationFrame(() => inputRef.current?.focus());
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex min-w-0 flex-1 justify-center">
      {/* Desktop: always visible inline input. */}
      <div className="hidden w-full max-w-md md:block">
        <div className="relative">
          <Search
            size={16}
            strokeWidth={1.5}
            className="text-ink-400 absolute top-1/2 left-3 -translate-y-1/2"
          />
          <input
            ref={inputRef}
            type="search"
            placeholder="Search clients or projects"
            // No wiring yet — the previous sidebar search input wasn't
            // hooked up either. Same affordance, new home.
            aria-label="Search"
            className="bg-paper border-line text-ink-900 placeholder:text-ink-400 focus:border-brand-teal-300 focus:ring-brand-teal-100 w-full rounded-lg border py-2 pr-12 pl-9 text-sm transition-colors focus:ring-2 focus:outline-none"
          />
          <kbd
            aria-hidden="true"
            className="text-ink-400 border-line bg-cream pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded border px-1.5 py-0.5 text-[10px] font-medium tracking-wider"
          >
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Mobile: icon-only that expands an overlay search. */}
      <div className="ml-auto md:hidden">
        {expanded ? (
          <div className="relative">
            <input
              ref={inputRef}
              type="search"
              placeholder="Search"
              aria-label="Search"
              onBlur={() => setExpanded(false)}
              className="bg-paper border-line text-ink-900 placeholder:text-ink-400 focus:border-brand-teal-300 w-40 rounded-lg border py-1.5 pr-2 pl-3 text-sm focus:outline-none"
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setExpanded(true);
              requestAnimationFrame(() => inputRef.current?.focus());
            }}
            aria-label="Search"
            className="text-ink-500 hover:bg-cream inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors"
          >
            <Search size={18} strokeWidth={1.5} />
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notification bell — opens the shared NotificationsDropdown anchored
// down-right of the icon. The red dot only renders when there's at
// least one unread row; clicking through a notification (or "Mark all
// as read") triggers a layout-level revalidate so the dot disappears
// without a manual refresh.
// ---------------------------------------------------------------------------

function NotificationBell({
  notifications,
  unreadCount,
}: {
  notifications: NotificationListItem[];
  unreadCount: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Click-outside dismiss — the panel itself stops propagation, so a
  // click anywhere outside this wrapper closes the dropdown.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={
          unreadCount > 0
            ? `${unreadCount} unread ${unreadCount === 1 ? 'notification' : 'notifications'}`
            : 'Notifications'
        }
        aria-haspopup="dialog"
        aria-expanded={open}
        className="text-ink-500 hover:bg-cream relative inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors"
      >
        <Bell size={18} strokeWidth={1.5} />
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            className="ring-paper absolute right-2 top-2 inline-block h-1.5 w-1.5 rounded-full bg-red-500 ring-2"
          />
        )}
      </button>

      <NotificationsDropdown
        notifications={notifications}
        unreadCount={unreadCount}
        open={open}
        onClose={() => setOpen(false)}
        anchor="right-below"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Avatar dropdown — initials + chevron + Sign out menu.
// ---------------------------------------------------------------------------

function AvatarMenu({ user }: { user: CurrentUser }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const displayName = user.fullName ?? user.email;
  const initials = initialsFrom(displayName);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${displayName}`}
        className={cn(
          'border-line bg-paper hover:bg-cream inline-flex items-center gap-2 rounded-full border py-1 pr-2 pl-1 transition-colors',
        )}
      >
        <span className="bg-brand-teal-500 flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold text-white">
          {initials || displayName.slice(0, 2).toUpperCase()}
        </span>
        <ChevronDown
          size={14}
          strokeWidth={1.5}
          className={cn(
            'text-ink-400 hidden flex-shrink-0 transition-transform sm:block',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="border-line bg-paper shadow-soft-md absolute right-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-xl border py-1"
        >
          <div className="border-line-2 border-b px-3 py-2">
            <div className="text-ink-900 truncate text-sm font-medium">{displayName}</div>
            <div className="text-ink-400 truncate text-xs capitalize">
              {user.role.replace('_', ' ')}
            </div>
          </div>
          <form action="/logout" method="post">
            <button
              type="submit"
              role="menuitem"
              className="text-ink-700 hover:bg-cream hover:text-ink-900 flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors"
            >
              <LogOut size={14} strokeWidth={1.5} className="text-ink-400" />
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

// Re-export for the trigger-styling Plus icon used in the CTA wrappers.
export { Plus };
