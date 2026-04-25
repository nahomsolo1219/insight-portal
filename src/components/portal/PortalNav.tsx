'use client';

import { ChevronDown, LogOut } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { CurrentUser } from '@/lib/auth/current-user';
import { cn, initialsFrom } from '@/lib/utils';

interface NavLink {
  href: string;
  label: string;
  /** Match nested routes too — e.g. /portal/projects/[id] should highlight Projects. */
  prefix?: string;
}

const NAV_LINKS: readonly NavLink[] = [
  { href: '/portal', label: 'Dashboard' },
  { href: '/portal/projects', label: 'Projects', prefix: '/portal/projects' },
  { href: '/portal/documents', label: 'Documents', prefix: '/portal/documents' },
  { href: '/portal/invoices', label: 'Invoices', prefix: '/portal/invoices' },
];

interface Props {
  user: CurrentUser;
}

/**
 * Top horizontal nav for the client portal. Deliberately minimal — this is
 * the client's first impression every time they sign in, and it should
 * read more like a hotel concierge desk than a software dashboard.
 *
 * The "active link" rule:
 * - `/portal` is exact-match (otherwise every nested route would highlight it).
 * - Other links use a `prefix` so `/portal/projects/[id]` keeps the Projects
 *   tab lit while the user drills into a specific project timeline.
 */
export function PortalNav({ user }: Props) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Click-outside / Escape to close the user menu. Standard pattern; we
  // do it inline rather than reaching for a popover library because this
  // is the only menu in the portal nav and the surface area is tiny.
  useEffect(() => {
    if (!menuOpen) return;
    function onMouseDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const displayName = user.fullName || user.email;
  const initials = initialsFrom(displayName);

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

        <nav className="flex flex-1 items-center gap-1">
          {NAV_LINKS.map((link) => {
            const isActive = link.prefix
              ? pathname.startsWith(link.prefix)
              : pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'relative rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'text-brand-teal-500'
                    : 'hover:text-brand-teal-500 text-gray-500',
                )}
              >
                {link.label}
                {isActive && (
                  <span className="bg-brand-teal-500 absolute right-3 -bottom-3 left-3 h-0.5 rounded-full" />
                )}
              </Link>
            );
          })}
        </nav>

        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="hover:bg-brand-warm-50 inline-flex items-center gap-2 rounded-xl px-2 py-1.5 transition-colors"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
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

          {menuOpen && (
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
      </div>
    </header>
  );
}
