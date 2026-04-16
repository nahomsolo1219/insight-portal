'use client';

import {
  Calendar,
  CircleHelp,
  FileText,
  Hammer,
  Images,
  LayoutDashboard,
  LayoutTemplate,
  LogOut,
  Search,
  Settings,
  UserCog,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { CurrentUser } from '@/lib/auth/current-user';
import { cn, initialsFrom } from '@/lib/utils';
import type { SidebarCounts } from './queries';

type BadgeKey = 'schedule' | 'photos' | 'decisions' | 'invoices';

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Optional key into the counts object supplied by the layout. */
  badgeKey?: BadgeKey;
}

interface NavSection {
  heading: string;
  items: NavItem[];
}

const sections: NavSection[] = [
  {
    heading: 'Overview',
    items: [
      { label: 'Dashboard', href: '/admin', icon: LayoutDashboard },
      { label: 'Schedule', href: '/admin/schedule', icon: Calendar },
    ],
  },
  {
    heading: 'Manage',
    items: [
      { label: 'Clients', href: '/admin/clients', icon: Users },
      { label: 'Photo Queue', href: '/admin/photo-queue', icon: Images, badgeKey: 'photos' },
      { label: 'Decisions', href: '/admin/decisions', icon: CircleHelp, badgeKey: 'decisions' },
      { label: 'Invoices', href: '/admin/invoices', icon: FileText, badgeKey: 'invoices' },
    ],
  },
  {
    heading: 'Setup',
    items: [
      { label: 'Vendors', href: '/admin/vendors', icon: Hammer },
      { label: 'Staff', href: '/admin/staff', icon: UserCog },
      { label: 'Templates', href: '/admin/templates', icon: LayoutTemplate },
      { label: 'Settings', href: '/admin/settings', icon: Settings },
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/admin') return pathname === '/admin';
  return pathname === href || pathname.startsWith(href + '/');
}

function countFor(key: BadgeKey | undefined, counts: SidebarCounts): number {
  switch (key) {
    case 'photos':
      return counts.photosPending;
    case 'decisions':
      return counts.decisionsPending;
    case 'invoices':
      return counts.invoicesUnpaid;
    case 'schedule':
      return 0; // No schedule-count query yet; reserve the slot.
    default:
      return 0;
  }
}

interface SidebarProps {
  user: CurrentUser;
  counts: SidebarCounts;
}

export function Sidebar({ user, counts }: SidebarProps) {
  const pathname = usePathname();
  const displayName = user.fullName ?? user.email;
  const initials = initialsFrom(displayName);
  const readableRole = user.role.replace('_', ' ');

  return (
    <aside className="border-brand-warm-300 flex h-full w-64 flex-shrink-0 flex-col border-r bg-white">
      {/* Teal header band with white logo */}
      <div className="bg-brand-teal-500 px-5 py-5">
        {/* External SVG hosted on the marketing CDN — next/image is unnecessary for a 2KB vector. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://cdn.prod.website-files.com/6824275111a08fd08762cad9/682450f39c2da996ae7c2f74_4a3e3e9e7263ddc479eb4374e0e0d332_Logo.svg"
          alt="Insight Home Maintenance"
          className="h-9 w-auto"
        />
      </div>

      {/* Search */}
      <div className="px-4 pt-4 pb-2">
        <div className="relative">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[#a3a3a3]" />
          <input
            type="search"
            placeholder="Search clients, projects…"
            className="bg-brand-warm-100 focus:border-brand-teal-200 w-full rounded-lg border border-transparent py-2 pr-3 pl-9 text-sm text-[#444] placeholder-[#a3a3a3] transition-colors focus:bg-white focus:outline-none"
          />
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-2">
        {sections.map((section) => (
          <div key={section.heading} className="mb-6">
            <div className="mb-2 px-3 text-[10px] font-semibold tracking-[0.14em] text-[#a3a3a3] uppercase">
              {section.heading}
            </div>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActive(pathname, item.href);
                const badgeValue = countFor(item.badgeKey, counts);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                        active
                          ? 'text-brand-teal-500 border-brand-teal-100 border bg-[color:var(--color-brand-nav-active)] font-medium'
                          : 'hover:bg-brand-warm-100 hover:text-brand-teal-500 border border-transparent text-[#555]',
                      )}
                    >
                      <Icon
                        className={cn(
                          'h-4 w-4 flex-shrink-0',
                          active ? 'text-brand-teal-500' : 'text-[#8a8a8a]',
                        )}
                      />
                      <span className="flex-1">{item.label}</span>
                      {badgeValue > 0 && (
                        <span className="bg-brand-gold-400 min-w-[18px] rounded-full px-1.5 py-0.5 text-center text-[10px] font-semibold text-white">
                          {badgeValue}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* User footer */}
      <div className="border-brand-warm-300 flex items-center gap-3 border-t px-4 py-3">
        <div className="bg-brand-teal-500 flex h-9 w-9 items-center justify-center rounded-lg text-xs font-semibold text-white">
          {initials || displayName.slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-[#333]">{displayName}</div>
          <div className="truncate text-xs text-[#8a8a8a] capitalize">{readableRole}</div>
        </div>
        <form action="/logout" method="post">
          <button
            type="submit"
            aria-label="Sign out"
            className="hover:bg-brand-warm-100 hover:text-brand-teal-500 rounded-lg p-2 text-[#8a8a8a] transition-colors"
          >
            <LogOut size={16} strokeWidth={1.5} />
          </button>
        </form>
      </div>
    </aside>
  );
}
