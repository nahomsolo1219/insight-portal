'use client';

import {
  Bell,
  CalendarClock,
  Check,
  ChevronDown,
  FileText,
  Home,
  LogOut,
  Menu,
  Pencil,
  Receipt,
  Settings,
  Wrench,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { Field, inputClass } from '@/components/admin/Field';
import { LoadingDots } from '@/components/admin/LoadingDots';
import { Modal } from '@/components/admin/Modal';
import { NotificationsDropdown } from '@/components/admin/NotificationsDropdown';
import { useToast } from '@/components/admin/ToastProvider';
import { PropertyCover } from '@/components/portal/PropertyCover';
import { updateMyProfile } from '@/app/portal/actions';
import { getMyNotificationFeed } from '@/app/notifications/actions';
import type { NotificationListItem } from '@/app/notifications/queries';
import type { CurrentUser } from '@/lib/auth/current-user';
import { cn, initialsFrom } from '@/lib/utils';

/** See AdminHeader.tsx for the polling-cadence rationale. */
const NOTIFICATION_POLL_MS = 30_000;

export interface PortalSidebarClient {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
}

export interface PortalSidebarProperty {
  id: string;
  name: string;
  region: string | null;
  city: string | null;
  state: string | null;
  coverPhotoUrl: string | null;
  coverPhotoUploadedAt: Date | null;
}

interface PortalSidebarProps {
  user: CurrentUser;
  client: PortalSidebarClient | null;
  /** Active property id; the switcher highlights this one. */
  propertyId: string;
  /** Every property the client owns; the switcher dropdown only renders
   *  when ≥ 2. With one property the pill stays as a static identity
   *  chip. */
  properties: PortalSidebarProperty[];
  /** Initial notifications + unread count for the bell-row dropdown.
   *  Same shape as AdminHeader: the SSR-passed values seed the bell;
   *  the bell row polls `getMyNotificationFeed` every 30s + on
   *  window focus + on dropdown open to keep the badge live. */
  notifications: NotificationListItem[];
  unreadNotificationCount: number;
}

interface NavSpec {
  segment: 'dashboard' | 'projects' | 'appointments' | 'documents' | 'invoices';
  label: string;
  icon: LucideIcon;
}

/** Sidebar nav items in priority order — what's happening at this home,
 *  then secondary references. Same ordering the Session-3 top-tab strip
 *  used; only the chrome shape changed. */
const NAV_ITEMS: ReadonlyArray<NavSpec> = [
  { segment: 'dashboard', label: 'Dashboard', icon: Home },
  { segment: 'projects', label: 'Projects', icon: Wrench },
  { segment: 'appointments', label: 'Appointments', icon: CalendarClock },
  { segment: 'documents', label: 'Documents', icon: FileText },
  { segment: 'invoices', label: 'Invoices', icon: Receipt },
];

/**
 * Dark-teal vertical sidebar that owns every primary navigation surface
 * for the property-scoped portal. Replaces the Session-3 top-tab strip
 * (and the PortalHeader component before it) with a single column on
 * the left that holds:
 *
 *   - logo
 *   - property switcher pill (cream-on-teal, with cover thumbnail +
 *     name + region; click opens a dropdown panel listing every
 *     property the client owns, with an "All properties" footer link
 *     to /portal — the existing pre-switch behavior)
 *   - nav items (Dashboard / Projects / Appointments / Documents /
 *     Invoices) with active state via background tint + amber dot
 *   - spacer that pushes the bottom rows down
 *   - hairline separator
 *   - notifications row (smooth-scroll to `#featured-decision` if any
 *     pending decisions exist; no-op otherwise — same rule the prior
 *     bell button used)
 *   - profile row (avatar + name + role + settings gear; click opens
 *     the same Edit-profile / Sign-out menu the previous PortalHeader
 *     avatar dropdown used)
 *
 * Mobile: the sidebar is hidden by default and slides in as a drawer
 * when the hamburger in the mobile top bar is tapped. Backdrop dismiss,
 * Escape dismiss, and tapping any link inside the drawer all close it.
 */
export function PortalSidebar({
  user,
  client,
  propertyId,
  properties,
  notifications,
  unreadNotificationCount,
}: PortalSidebarProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const activeProperty = properties.find((p) => p.id === propertyId) ?? null;

  // Escape closes the drawer on mobile.
  useEffect(() => {
    if (!drawerOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setDrawerOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  // Body scroll-lock while the mobile drawer is open. Without it, the
  // background pane scrolls under the drawer when a finger drags.
  useEffect(() => {
    if (!drawerOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [drawerOpen]);

  const closeDrawer = () => setDrawerOpen(false);

  return (
    <>
      <MobileTopBar
        activeProperty={activeProperty}
        onOpenDrawer={() => setDrawerOpen(true)}
        client={client}
        user={user}
      />

      {/* Backdrop — only the visible-state class is animated; pointer
          events flip with the open flag so closed-state taps fall
          through to the page beneath. */}
      <div
        aria-hidden={!drawerOpen}
        onClick={closeDrawer}
        className={cn(
          'fixed inset-0 z-30 bg-black/40 backdrop-blur-sm transition-opacity md:hidden',
          drawerOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      />

      <aside
        aria-label="Primary navigation"
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col text-paper transition-transform',
          drawerOpen ? 'translate-x-0' : '-translate-x-full',
          'md:translate-x-0',
        )}
        style={{ backgroundColor: 'var(--teal-900)' }}
      >
        {/* Mobile-only close button. */}
        <button
          type="button"
          aria-label="Close menu"
          onClick={closeDrawer}
          className="text-paper/70 hover:bg-paper/5 hover:text-paper absolute top-3 right-3 inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors md:hidden"
        >
          <X size={18} strokeWidth={1.5} />
        </button>

        {/* Logo */}
        <div className="px-6 pt-7 pb-6">
          <Link
            href="/portal"
            aria-label="Insight HM — back to all homes"
            onClick={closeDrawer}
            className="inline-flex items-center"
          >
            <Image
              src="/logo-dark.svg"
              alt="Insight HM"
              width={140}
              height={32}
              className="h-8 w-auto"
              priority
            />
          </Link>
        </div>

        {/* Property switcher */}
        <div className="px-4 pb-5">
          <PropertySwitcher
            propertyId={propertyId}
            activeProperty={activeProperty}
            properties={properties}
            onNavigate={closeDrawer}
          />
        </div>

        {/* Nav items — flex-1 pushes the notifications + profile rows
            to the bottom. */}
        <nav aria-label="Sections" className="flex-1 overflow-y-auto px-3 pb-4">
          <ul className="space-y-0.5">
            {NAV_ITEMS.map((item) => (
              <NavRow
                key={item.segment}
                href={`/portal/p/${propertyId}/${item.segment}`}
                label={item.label}
                Icon={item.icon}
                onNavigate={closeDrawer}
              />
            ))}
          </ul>
        </nav>

        {/* Notifications row — sits right above the profile, separated
            by a thin hairline. */}
        <div className="border-paper/10 border-t">
          <NotificationsRow
            initialNotifications={notifications}
            initialUnreadCount={unreadNotificationCount}
            onNavigate={closeDrawer}
          />
        </div>

        {/* Profile row — final row in the column. */}
        <div className="border-paper/10 border-t">
          <ProfileRow user={user} client={client} />
        </div>
      </aside>
    </>
  );
}

// ---------------------------------------------------------------------------
// Mobile top bar — only renders below md.
// ---------------------------------------------------------------------------

function MobileTopBar({
  activeProperty,
  onOpenDrawer,
  client,
  user,
}: {
  activeProperty: PortalSidebarProperty | null;
  onOpenDrawer: () => void;
  client: PortalSidebarClient | null;
  user: CurrentUser;
}) {
  const displayName = client?.name || user.fullName || user.email;
  const initials = initialsFrom(displayName);
  const avatarUrl = client?.avatarUrl ?? null;

  return (
    <header className="bg-paper border-line sticky top-0 z-30 flex h-14 items-center justify-between border-b px-4 md:hidden">
      <button
        type="button"
        onClick={onOpenDrawer}
        aria-label="Open menu"
        className="hover:bg-cream text-ink-700 inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors"
      >
        <Menu size={18} strokeWidth={1.5} />
      </button>
      {activeProperty && (
        <span className="text-ink-900 truncate px-3 text-sm font-medium">
          {activeProperty.name}
        </span>
      )}
      {/* Avatar trigger — taps open the drawer where the actual profile
          menu lives. Keeps mobile single-tap discoverability without a
          parallel popover system. */}
      <button
        type="button"
        onClick={onOpenDrawer}
        aria-label="Open menu"
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center"
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt={displayName}
            className="h-8 w-8 rounded-full object-cover"
          />
        ) : (
          <span
            className="text-paper flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-semibold"
            style={{ backgroundColor: 'var(--amber-500)' }}
          >
            {initials || 'U'}
          </span>
        )}
      </button>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Nav row — one item in the vertical stack.
// ---------------------------------------------------------------------------

function NavRow({
  href,
  label,
  Icon,
  onNavigate,
}: {
  href: string;
  label: string;
  Icon: LucideIcon;
  onNavigate: () => void;
}) {
  const pathname = usePathname();
  const active = isNavActive(pathname, href);

  return (
    <li>
      <Link
        href={href}
        onClick={onNavigate}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors',
          active
            ? 'bg-paper/5 text-paper'
            : 'text-paper/70 hover:bg-paper/[0.03] hover:text-paper',
        )}
      >
        <Icon size={16} strokeWidth={1.5} className="flex-shrink-0" />
        <span className="flex-1">{label}</span>
        {active && (
          <span
            aria-hidden="true"
            className="inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full"
            style={{ backgroundColor: 'var(--amber-500)' }}
          />
        )}
      </Link>
    </li>
  );
}

/** Active rule: prefix-match so `/projects/[id]` keeps Projects lit. */
function isNavActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  return pathname.startsWith(href + '/');
}

// ---------------------------------------------------------------------------
// Property switcher — cream pill with cover thumbnail + name + region.
// Dropdown panel opens BELOW the pill (sidebar width is too narrow for a
// flyout to the right). For single-property clients the pill stays but
// the chevron and click-to-open behavior drop away.
// ---------------------------------------------------------------------------

function PropertySwitcher({
  propertyId,
  activeProperty,
  properties,
  onNavigate,
}: {
  propertyId: string;
  activeProperty: PortalSidebarProperty | null;
  properties: PortalSidebarProperty[];
  onNavigate: () => void;
}) {
  const isMulti = properties.length >= 2;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismissOnOutside(ref, open, () => setOpen(false));

  if (!activeProperty) return null;

  const meta = activeProperty.region
    || [activeProperty.city, activeProperty.state].filter(Boolean).join(', ')
    || null;

  // Pill body — reused between the static (single-property) and the
  // button (multi-property) variants so they look identical until the
  // chevron + interactivity kick in.
  const pillBody = (
    <>
      <div className="border-line flex h-9 w-9 flex-shrink-0 overflow-hidden rounded-md border">
        <PropertyCover
          propertyId={activeProperty.id}
          coverPhotoUrl={activeProperty.coverPhotoUrl}
          uploadedAt={activeProperty.coverPhotoUploadedAt}
          alt=""
          className="h-9 w-9"
        />
      </div>
      <div className="min-w-0 flex-1 text-left">
        <div className="text-ink-900 truncate text-sm font-medium">
          {activeProperty.name}
        </div>
        {meta && <div className="text-ink-500 truncate text-xs">{meta}</div>}
      </div>
      {isMulti && (
        <ChevronDown
          size={14}
          strokeWidth={1.5}
          className={cn(
            'text-ink-400 flex-shrink-0 transition-transform',
            open && 'rotate-180',
          )}
        />
      )}
    </>
  );

  if (!isMulti) {
    return (
      <div className="bg-cream flex w-full items-center gap-3 rounded-xl px-3 py-2.5">
        {pillBody}
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="bg-cream hover:bg-paper flex w-full items-center gap-3 rounded-xl px-3 py-2.5 transition-colors"
      >
        {pillBody}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Switch property"
          className="border-line bg-paper absolute top-full right-0 left-0 z-50 mt-2 overflow-hidden rounded-xl border"
          style={{ boxShadow: 'var(--shadow-soft-md)' }}
        >
          <ul className="py-1">
            {properties.map((p) => {
              const isActive = p.id === propertyId;
              const propertyMeta = p.region
                || [p.city, p.state].filter(Boolean).join(', ')
                || '—';
              return (
                <li key={p.id}>
                  <Link
                    href={`/portal/p/${p.id}/dashboard`}
                    onClick={() => {
                      setOpen(false);
                      onNavigate();
                    }}
                    role="menuitem"
                    className="hover:bg-cream flex items-center gap-3 px-3 py-2 transition-colors"
                  >
                    <div className="border-line flex-shrink-0 overflow-hidden rounded-lg border">
                      <PropertyCover
                        propertyId={p.id}
                        coverPhotoUrl={p.coverPhotoUrl}
                        uploadedAt={p.coverPhotoUploadedAt}
                        alt=""
                        className="h-8 w-8"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-ink-900 truncate text-sm font-medium">
                        {p.name}
                      </div>
                      <div className="text-ink-400 truncate text-xs">
                        {propertyMeta}
                      </div>
                    </div>
                    {isActive && (
                      <Check
                        size={14}
                        strokeWidth={2}
                        className="text-amber-600 flex-shrink-0"
                        aria-label="Current property"
                      />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="border-line-2 border-t">
            <Link
              href="/portal"
              onClick={() => {
                setOpen(false);
                onNavigate();
              }}
              role="menuitem"
              className="text-ink-500 hover:text-ink-900 hover:bg-cream flex items-center justify-between px-4 py-2.5 text-xs tracking-wider uppercase transition-colors"
            >
              All properties
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notifications row — opens the shared NotificationsDropdown anchored to
// the right of the sidebar (fixed position, bottom-aligned). The badge
// count comes from real notifications now (not the prior pending-
// decision proxy), and the dropdown lets a client mark items read
// without leaving the current page.
// ---------------------------------------------------------------------------

function NotificationsRow({
  initialNotifications,
  initialUnreadCount,
  onNavigate,
}: {
  initialNotifications: NotificationListItem[];
  initialUnreadCount: number;
  /** Closes the mobile drawer when one of the dropdown rows navigates. */
  onNavigate: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState(initialNotifications);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const ref = useRef<HTMLDivElement>(null);
  useDismissOnOutside(ref, open, () => setOpen(false));

  // Polling — see AdminHeader.NotificationBell for the same pattern
  // and rationale. Keeps the badge live without depending on the
  // SSR-passed initial values (which only refresh on full page
  // navigation; that's the Session 7 follow-up bug this fixes).
  const refetch = useCallback(async () => {
    try {
      const feed = await getMyNotificationFeed();
      setNotifications(feed.notifications);
      setUnreadCount(feed.unreadCount);
    } catch (error) {
      console.error('[NotificationsRow] poll failed', error);
    }
  }, []);

  useEffect(() => {
    const id = setInterval(refetch, NOTIFICATION_POLL_MS);
    return () => clearInterval(id);
  }, [refetch]);

  useEffect(() => {
    window.addEventListener('focus', refetch);
    return () => window.removeEventListener('focus', refetch);
  }, [refetch]);

  // Open-time refetch lives in the click handler rather than an
  // effect — the lint rule blocks setState inside effects, and a
  // user click is the right place to kick off a fetch.
  function toggleOpen() {
    setOpen((prev) => {
      const next = !prev;
      if (next) refetch();
      return next;
    });
  }

  // Optimistic updates — same callbacks the admin bell passes down.
  const handleMarkOneRead = useCallback((notificationId: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, isRead: true } : n)),
    );
    setUnreadCount((c) => Math.max(0, c - 1));
  }, []);

  const handleMarkAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
  }, []);

  const hasUnread = unreadCount > 0;

  function close() {
    setOpen(false);
    onNavigate();
  }

  return (
    <div ref={ref}>
      <button
        type="button"
        onClick={toggleOpen}
        aria-label={
          hasUnread
            ? `${unreadCount} unread ${unreadCount === 1 ? 'notification' : 'notifications'}`
            : 'Notifications'
        }
        aria-haspopup="dialog"
        aria-expanded={open}
        className="text-paper/70 hover:bg-paper/[0.03] hover:text-paper flex w-full items-center gap-3 px-5 py-3 text-sm font-medium transition-colors"
      >
        <Bell size={16} strokeWidth={1.5} className="flex-shrink-0" />
        <span className="flex-1 text-left">Notifications</span>
        {hasUnread && (
          <span
            className="text-paper inline-flex h-5 min-w-5 flex-shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold"
            style={{ backgroundColor: 'var(--amber-500)' }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      <NotificationsDropdown
        notifications={notifications}
        unreadCount={unreadCount}
        open={open}
        onClose={close}
        anchor="right-of-bottom"
        onMarkOneRead={handleMarkOneRead}
        onMarkAllRead={handleMarkAllRead}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Profile row — avatar + name + role + settings gear. Tap opens the
// Edit-profile / Sign-out menu the prior PortalHeader avatar dropdown
// surfaced. Dropdown opens upward since the row is bottom-anchored.
// ---------------------------------------------------------------------------

function ProfileRow({
  user,
  client,
}: {
  user: CurrentUser;
  client: PortalSidebarClient | null;
}) {
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismissOnOutside(ref, open, () => setOpen(false));

  const displayName = client?.name || user.fullName || user.email;
  const initials = initialsFrom(displayName);
  const avatarUrl = client?.avatarUrl ?? null;
  const role = user.role.replace('_', ' ');

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${displayName}`}
        className="hover:bg-paper/[0.03] flex w-full items-center gap-3 px-5 py-3 transition-colors"
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt={displayName}
            className="h-8 w-8 flex-shrink-0 rounded-full object-cover"
          />
        ) : (
          <span
            className="text-paper flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
            style={{ backgroundColor: 'var(--amber-500)' }}
          >
            {initials || 'U'}
          </span>
        )}
        <div className="min-w-0 flex-1 text-left">
          <div className="text-paper truncate text-sm font-medium">{displayName}</div>
          <div className="text-paper/60 truncate text-xs capitalize">{role}</div>
        </div>
        <Settings
          size={14}
          strokeWidth={1.5}
          className="text-paper/60 flex-shrink-0"
        />
      </button>

      {open && (
        <div
          role="menu"
          className="border-line bg-paper absolute right-3 bottom-full z-50 mb-1 w-52 overflow-hidden rounded-xl border py-1"
          style={{ boxShadow: 'var(--shadow-soft-md)' }}
        >
          {client && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setEditOpen(true);
              }}
              className="text-ink-700 hover:bg-cream hover:text-ink-900 flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors"
            >
              <Pencil size={14} strokeWidth={1.5} className="text-ink-400" />
              Edit profile
            </button>
          )}
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

      {editOpen && client && (
        <EditProfileModal client={client} onClose={() => setEditOpen(false)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit profile modal — drives the existing updateMyProfile server action.
// ---------------------------------------------------------------------------

function EditProfileModal({
  client,
  onClose,
}: {
  client: PortalSidebarClient;
  onClose: () => void;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(client.name);
  const [email, setEmail] = useState(client.email ?? '');
  const [phone, setPhone] = useState(client.phone ?? '');

  function submit() {
    setError(null);
    if (!name.trim()) return setError('Name cannot be empty.');
    if (!email.trim()) return setError('Email cannot be empty.');

    startTransition(async () => {
      const result = await updateMyProfile({ name, email, phone });
      if (!result.success) {
        setError(result.error);
        showToast(result.error, 'error');
        return;
      }
      showToast('Profile updated');
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit profile"
      size="md"
      locked={isPending}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-xl px-5 py-2.5 font-medium text-gray-700 transition-all hover:bg-gray-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={isPending}
            className="bg-brand-teal-500 hover:bg-brand-teal-600 shadow-soft rounded-xl px-5 py-2.5 font-medium text-white transition-all disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? (
              <>
                Saving
                <LoadingDots />
              </>
            ) : (
              'Save changes'
            )}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name" required hint="The household name shown on your invoices and reports.">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Email" required>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Phone" hint="Optional.">
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={inputClass}
          />
        </Field>

        {error && (
          <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Shared dismiss helper — click-outside + Escape.
// ---------------------------------------------------------------------------

function useDismissOnOutside(
  ref: React.RefObject<HTMLDivElement | null>,
  open: boolean,
  close: () => void,
) {
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, ref, close]);
}
