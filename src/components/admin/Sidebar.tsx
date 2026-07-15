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
  Settings,
  UserCog,
  Users,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { CurrentUser } from '@/lib/auth/current-user';
import { cn, initialsFrom } from '@/lib/utils';

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

interface NavSection {
  heading: string;
  items: NavItem[];
}

export const sidebarSections: NavSection[] = [
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
      // Maintenance plans are a top-level concept (peers of clients +
      // schedule) — keeping them in Manage groups them with the rest
      // of the operate-on-it surfaces. Spec called for "between
      // Projects and Schedule" but the sidebar has no Projects link;
      // Manage is the closest semantic match.
      { label: 'Maintenance', href: '/admin/maintenance', icon: Wrench },
      { label: 'Photo Queue', href: '/admin/photo-queue', icon: Images },
      { label: 'Decisions', href: '/admin/decisions', icon: CircleHelp },
      { label: 'Invoices', href: '/admin/invoices', icon: FileText },
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

export function isActive(pathname: string, href: string): boolean {
  if (href === '/admin') return pathname === '/admin';
  return pathname === href || pathname.startsWith(href + '/');
}

interface SidebarProps {
  user: CurrentUser;
  /** Resolved public URL of the current admin's avatar; falls back
   *  to the initials block when null. Composed once per request in
   *  the admin layout — see /app/admin/layout.tsx. */
  avatarPublicUrl?: string | null;
}

/**
 * The nav + user footer that fills the sidebar column. Shared verbatim by the
 * desktop static sidebar (`Sidebar`) and the mobile off-canvas drawer
 * (`AdminSidebarDrawer`) so the two can never drift. `onNavigate` fires on
 * every nav link click — the drawer passes `closeDrawer` here; the static
 * desktop sidebar passes nothing.
 *
 * Earlier sessions threaded "what needs your attention" counts into amber
 * badges here; that moved to the dashboard's "Needs attention" surface in
 * Session 7. The header bell owns real notifications.
 */
export function SidebarBody({
  user,
  avatarPublicUrl,
  onNavigate,
}: SidebarProps & { onNavigate?: () => void }) {
  const pathname = usePathname();
  const displayName = user.fullName ?? user.email;
  const initials = initialsFrom(displayName);
  const readableRole = user.role.replace('_', ' ');

  return (
    <>
      {/* Nav — starts directly under the header, with comfortable top
          breathing room since there's no longer a logo band or search
          element above it. */}
      <nav className="flex-1 overflow-y-auto px-3 pt-5 pb-2">
        {sidebarSections.map((section) => (
          <div key={section.heading} className="mb-6">
            {/* Section heading: amber hairline + uppercase tracked label —
                editorial eyebrow pattern at sidebar density. */}
            <div className="mb-2 flex items-center gap-2 px-3">
              <span
                aria-hidden="true"
                className="bg-brand-gold-500 inline-block h-px w-5 flex-shrink-0"
              />
              <span className="text-[10px] font-semibold tracking-[0.18em] text-[#a3a3a3] uppercase">
                {section.heading}
              </span>
            </div>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActive(pathname, item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      className={cn(
                        // min-h-11 (44px) keeps the touch target honest on
                        // mobile; on desktop the row is naturally taller than
                        // its py-2 anyway so this doesn't move the layout.
                        'flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                        active
                          ? 'text-brand-teal-500 border-brand-teal-100 border bg-[color:var(--color-brand-nav-active)] font-medium'
                          : 'hover:bg-cream hover:text-brand-teal-500 border border-transparent text-[#555]',
                      )}
                    >
                      <Icon
                        className={cn(
                          'h-4 w-4 flex-shrink-0',
                          active ? 'text-brand-teal-500' : 'text-[#8a8a8a]',
                        )}
                      />
                      <span className="flex-1">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* User footer — compact identity strip + sign-out. */}
      <div className="border-line flex items-center gap-3 border-t px-4 py-3">
        {avatarPublicUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarPublicUrl}
            alt={displayName}
            className="h-9 w-9 flex-shrink-0 rounded-lg object-cover"
          />
        ) : (
          <div className="bg-brand-teal-500 flex h-9 w-9 items-center justify-center rounded-lg text-xs font-semibold text-white">
            {initials || displayName.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-[#333]">{displayName}</div>
          <div className="truncate text-xs text-[#8a8a8a] capitalize">{readableRole}</div>
        </div>
        <form action="/logout" method="post">
          <button
            type="submit"
            aria-label="Sign out"
            className="hover:bg-cream hover:text-brand-teal-500 inline-flex h-11 w-11 items-center justify-center rounded-lg text-[#8a8a8a] transition-colors"
          >
            <LogOut size={16} strokeWidth={1.5} />
          </button>
        </form>
      </div>
    </>
  );
}

/**
 * Desktop admin sidebar — the static left column. Hidden below `md`, where the
 * off-canvas `AdminSidebarDrawer` (opened from the header hamburger) takes
 * over. `md:flex` restores the exact previous desktop rendering, so desktop is
 * unchanged.
 */
export function Sidebar({ user, avatarPublicUrl }: SidebarProps) {
  return (
    <aside className="border-line bg-paper hidden h-full w-64 flex-shrink-0 flex-col border-r md:flex">
      <SidebarBody user={user} avatarPublicUrl={avatarPublicUrl} />
    </aside>
  );
}
