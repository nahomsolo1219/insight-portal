'use client';

import {
  ChevronDown,
  FileText,
  Home,
  LayoutDashboard,
  LogOut,
  Receipt,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ComponentType } from 'react';
import type { CurrentUser } from '@/lib/auth/current-user';
import { cn, initialsFrom } from '@/lib/utils';

interface NavLink {
  href: string;
  label: string;
  /** Match nested routes (e.g. /portal/projects/[id] keeps Projects active). */
  prefix?: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
}

/**
 * Single source of truth for the portal's primary navigation. The top bar
 * renders these on md+ and the mobile bottom tab bar renders the same list
 * with icons added.
 */
const NAV_LINKS: readonly NavLink[] = [
  { href: '/portal', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/portal/projects', label: 'Projects', prefix: '/portal/projects', icon: Home },
  { href: '/portal/documents', label: 'Documents', prefix: '/portal/documents', icon: FileText },
  { href: '/portal/invoices', label: 'Invoices', prefix: '/portal/invoices', icon: Receipt },
];

interface Props {
  user: CurrentUser;
}

/**
 * Two-piece chrome for the client portal.
 *
 * - Desktop / tablet (md+): full top bar with logo + nav links + user menu.
 * - Mobile (<md): top bar slims to logo + user menu (so sign-out is still
 *   reachable), and a fixed bottom tab bar handles primary navigation.
 *   The standard iOS/Android pattern; thumb-distance matters more than
 *   header real estate at 375px.
 *
 * Both surfaces share `NAV_LINKS` and `useActiveHref` so adding a new
 * portal page is a one-place edit.
 */
export function PortalNav({ user }: Props) {
  const pathname = usePathname();
  const isActive = useActiveHref(pathname);

  return (
    <>
      <TopBar user={user} isActive={isActive} />
      <BottomTabs isActive={isActive} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Active-link rule
// ---------------------------------------------------------------------------

/**
 * `/portal` is exact-match (otherwise every nested portal route would
 * highlight Dashboard); other links use a prefix so child routes light up
 * the parent tab.
 */
function useActiveHref(pathname: string) {
  return (link: NavLink): boolean =>
    link.prefix ? pathname.startsWith(link.prefix) : pathname === link.href;
}

// ---------------------------------------------------------------------------
// Top bar
// ---------------------------------------------------------------------------

function TopBar({
  user,
  isActive,
}: {
  user: CurrentUser;
  isActive: (link: NavLink) => boolean;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-gray-100 bg-white">
      <div className="mx-auto flex max-w-[1100px] items-center gap-8 px-6 py-3">
        <Link href="/portal" className="inline-flex items-center gap-2.5">
          <div className="bg-brand-teal-500 flex h-8 w-8 items-center justify-center rounded-lg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://cdn.prod.website-files.com/6824275111a08fd08762cad9/682450f39c2da996ae7c2f74_4a3e3e9e7263ddc479eb4374e0e0d332_Logo.svg"
              alt="Insight"
              className="h-4 w-4"
            />
          </div>
          <span className="text-brand-teal-500 text-sm font-bold tracking-wider">INSIGHT</span>
        </Link>

        {/* Nav links — hidden on mobile (bottom tabs take over). */}
        <nav className="hidden flex-1 items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => {
            const active = isActive(link);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'relative rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'text-brand-teal-500'
                    : 'hover:text-brand-teal-500 text-gray-500',
                )}
              >
                {link.label}
                {active && (
                  <span className="bg-brand-teal-500 absolute right-3 -bottom-3 left-3 h-0.5 rounded-full" />
                )}
              </Link>
            );
          })}
        </nav>

        <UserMenu user={user} />
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// User menu (top-right)
// ---------------------------------------------------------------------------

function UserMenu({ user }: { user: CurrentUser }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Click-outside / Escape close pattern. Inline because this is the only
  // popover in the portal nav surface — no need for a popover library.
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

  const displayName = user.fullName || user.email;
  const initials = initialsFrom(displayName);

  // ml-auto keeps it pushed to the right when nav links are hidden on mobile;
  // the gap-8 on the parent handles spacing on desktop.
  return (
    <div ref={ref} className="relative ml-auto md:ml-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="hover:bg-brand-warm-50 inline-flex items-center gap-2 rounded-xl px-2 py-1.5 transition-colors"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="bg-brand-teal-500 flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white">
          {initials || 'U'}
        </span>
        <span className="hidden text-left sm:block">
          <span className="block text-xs font-medium text-gray-900">{displayName}</span>
          <span className="block text-[10px] text-gray-500">Member</span>
        </span>
        <ChevronDown size={14} strokeWidth={1.5} className="text-gray-400" />
      </button>

      {open && (
        <div
          role="menu"
          className="shadow-elevated absolute right-0 mt-2 w-48 overflow-hidden rounded-xl border border-gray-100 bg-white py-1"
        >
          <form action="/logout" method="POST">
            <button
              type="submit"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50"
            >
              <LogOut size={14} strokeWidth={1.5} className="text-gray-400" />
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bottom tab bar (mobile only)
// ---------------------------------------------------------------------------

function BottomTabs({ isActive }: { isActive: (link: NavLink) => boolean }) {
  return (
    <nav
      // Fixed to the viewport bottom on mobile. md:hidden so it disappears
      // when the desktop top nav takes over. The 50 z-index sits above page
      // content but below modals (z-100) and overlays (lightbox is z-50
      // too, but it covers the entire viewport so the tab bar is invisible
      // beneath it anyway).
      className="fixed right-0 bottom-0 left-0 z-40 border-t border-gray-100 bg-white md:hidden"
      aria-label="Primary"
    >
      <ul className="grid grid-cols-4">
        {NAV_LINKS.map((link) => {
          const active = isActive(link);
          const Icon = link.icon;
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                className={cn(
                  // 56px tall meets the 44px touch-target minimum and
                  // leaves a comfortable label below the icon.
                  'flex flex-col items-center justify-center gap-0.5 py-2 transition-colors',
                  active ? 'text-brand-teal-500' : 'text-gray-400',
                )}
                aria-current={active ? 'page' : undefined}
              >
                <Icon size={20} strokeWidth={1.5} />
                <span className={cn('text-[10px]', active ? 'font-semibold' : 'font-medium')}>
                  {link.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
