'use client';

import { Menu, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import type { CurrentUser } from '@/lib/auth/current-user';
import { cn } from '@/lib/utils';
import { SidebarBody } from './Sidebar';

// ---------------------------------------------------------------------------
// Shared open/close state for the mobile nav. The header hamburger and the
// off-canvas drawer live in different parts of the layout tree, so a tiny
// context coordinates them. Mirrors the client portal's drawer mechanism
// (PortalSidebar) — the only difference is the admin header and sidebar are
// separate components, so the state is lifted into a provider rather than
// held inside one component.
// ---------------------------------------------------------------------------

interface AdminNavState {
  open: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
}

const AdminNavContext = createContext<AdminNavState | null>(null);

export function AdminNavProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const openDrawer = useCallback(() => setOpen(true), []);
  const closeDrawer = useCallback(() => setOpen(false), []);
  return (
    <AdminNavContext.Provider value={{ open, openDrawer, closeDrawer }}>
      {children}
    </AdminNavContext.Provider>
  );
}

function useAdminNav(): AdminNavState {
  const ctx = useContext(AdminNavContext);
  if (!ctx) throw new Error('useAdminNav must be used within AdminNavProvider');
  return ctx;
}

/**
 * Header hamburger — mobile only (`md:hidden`). Opens the drawer. Rendered
 * inside AdminHeader's mobile logo block.
 */
export function AdminMenuButton() {
  const { openDrawer } = useAdminNav();
  return (
    <button
      type="button"
      onClick={openDrawer}
      aria-label="Open menu"
      className="text-ink-700 hover:bg-cream inline-flex h-11 w-11 items-center justify-center rounded-lg transition-colors md:hidden"
    >
      <Menu size={20} strokeWidth={1.5} />
    </button>
  );
}

interface DrawerProps {
  user: CurrentUser;
  avatarPublicUrl?: string | null;
  firmName?: string;
  logoDarkUrl?: string | null;
}

/**
 * Off-canvas admin sidebar drawer — mobile only (`md:hidden`). Slides in from
 * the left behind a dimmed backdrop; closes on backdrop tap, on the close
 * button, and on any nav-link select (via SidebarBody's onNavigate) and on
 * route change. Body scroll locks while open. Copies the portal drawer's
 * approach class-for-class.
 */
export function AdminSidebarDrawer({
  user,
  avatarPublicUrl,
  firmName,
  logoDarkUrl,
}: DrawerProps) {
  const { open, closeDrawer } = useAdminNav();
  const pathname = usePathname();

  // Close on route change — a nav select navigates, and we want the drawer
  // gone once the new route paints even if something bypassed onNavigate.
  useEffect(() => {
    closeDrawer();
  }, [pathname, closeDrawer]);

  // Lock background scroll while the drawer is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Esc closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDrawer();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, closeDrawer]);

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden={!open}
        onClick={closeDrawer}
        className={cn(
          'fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity md:hidden',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      />

      {/* Drawer panel */}
      <aside
        aria-label="Primary navigation"
        aria-hidden={!open}
        className={cn(
          'border-line bg-paper fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r transition-transform md:hidden',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Teal header band — mirrors the desktop header's logo panel + carries
            the close control. */}
        <div className="bg-brand-teal-500 flex h-16 flex-shrink-0 items-center justify-between px-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoDarkUrl || '/logo-dark.svg'}
            alt={firmName || 'Insight Home Maintenance'}
            className="h-6 w-auto"
          />
          <button
            type="button"
            onClick={closeDrawer}
            aria-label="Close menu"
            className="text-paper/80 hover:bg-paper/10 hover:text-paper inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors"
          >
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>

        <SidebarBody user={user} avatarPublicUrl={avatarPublicUrl} onNavigate={closeDrawer} />
      </aside>
    </>
  );
}
