'use client';

import {
  Bell,
  Check,
  ChevronDown,
  LogOut,
  Pencil,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Field, inputClass } from '@/components/admin/Field';
import { LoadingDots } from '@/components/admin/LoadingDots';
import { Modal } from '@/components/admin/Modal';
import { useToast } from '@/components/admin/ToastProvider';
import { PropertyCover } from '@/components/portal/PropertyCover';
import { updateMyProfile } from '@/app/portal/actions';
import type { CurrentUser } from '@/lib/auth/current-user';
import { cn, initialsFrom } from '@/lib/utils';

export interface PortalHeaderClient {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
}

export interface PortalHeaderProperty {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  coverPhotoUrl: string | null;
  coverPhotoUploadedAt: Date | null;
}

interface PortalHeaderProps {
  user: CurrentUser;
  client: PortalHeaderClient | null;
  /** Active property id; the switcher highlights this one. */
  propertyId: string;
  /** Every property the client owns; the pill renders only when ≥ 2. */
  properties: PortalHeaderProperty[];
  /** Drives the bell's amber dot + the click target. */
  pendingDecisionCount: number;
}

interface NavTab {
  segment: 'dashboard' | 'projects' | 'appointments' | 'documents' | 'invoices';
  label: string;
}

/** Top-level nav tabs shown on every property-scoped page. The order
 *  matches the user's reading priority — what's happening at this home,
 *  then secondary references (appointments / docs / invoices). */
const NAV_TABS: ReadonlyArray<NavTab> = [
  { segment: 'dashboard', label: 'Dashboard' },
  { segment: 'projects', label: 'Projects' },
  { segment: 'appointments', label: 'Appointments' },
  { segment: 'documents', label: 'Documents' },
  { segment: 'invoices', label: 'Invoices' },
];

/**
 * Editorial chrome for the per-property portal. Two stacked rows in a
 * single sticky header:
 *
 *   Row 1 (`h-16` / `sm:h-[68px]`): logo, optional property switcher pill,
 *     notification bell, avatar dropdown.
 *   Row 2 (`h-12`): horizontal tab strip — Dashboard / Projects / Appoint-
 *     ments / Documents / Invoices, scrollable on narrow viewports.
 *
 * Tabs replaced the original three-dot overflow menu (Session 3) — every
 * page is one click away, no hidden surfaces. The bell is the only
 * notifications affordance: a smooth-scroll to the dashboard's
 * `#featured-decision` anchor when a decision is pending; no-op otherwise.
 */
export function PortalHeader({
  user,
  client,
  propertyId,
  properties,
  pendingDecisionCount,
}: PortalHeaderProps) {
  const showSwitcher = properties.length >= 2;
  const activeProperty = properties.find((p) => p.id === propertyId) ?? null;

  return (
    <header className="bg-cream border-line sticky top-0 z-40 border-b">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
        {/* Row 1: chrome */}
        <div className="flex h-16 items-center gap-3 sm:h-[68px] sm:gap-4">
          <Link
            href="/portal"
            className="inline-flex items-center"
            aria-label="Insight HM — back to all homes"
          >
            <Image
              src="/logo-light.svg"
              alt="Insight HM"
              width={130}
              height={28}
              className="h-7 w-auto sm:h-8"
              priority
            />
          </Link>

          {showSwitcher && activeProperty && (
            <PropertySwitcher
              propertyId={propertyId}
              activeProperty={activeProperty}
              properties={properties}
            />
          )}

          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <NotificationBell pendingDecisionCount={pendingDecisionCount} />
            <AvatarMenu user={user} client={client} />
          </div>
        </div>

        {/* Row 2: tab strip */}
        <PortalTabs propertyId={propertyId} />
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Top-tab strip
// ---------------------------------------------------------------------------

function PortalTabs({ propertyId }: { propertyId: string }) {
  const pathname = usePathname();
  const base = `/portal/p/${propertyId}`;

  return (
    <nav
      aria-label="Property sections"
      // overflow-x-auto + the [&::-webkit-scrollbar]:hidden pair lets the
      // strip scroll horizontally on narrow viewports without showing a
      // scrollbar gutter; tabs wrap to one row regardless of count.
      className="-mx-4 flex gap-1 overflow-x-auto px-4 [-ms-overflow-style:none] [scrollbar-width:none] sm:-mx-6 sm:px-6 [&::-webkit-scrollbar]:hidden"
    >
      {NAV_TABS.map((tab) => {
        const href = `${base}/${tab.segment}`;
        const active = isTabActive(pathname, href);
        return (
          <Link
            key={tab.segment}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'relative flex-shrink-0 px-4 py-3 text-sm font-medium transition-colors',
              active
                ? 'text-ink-900'
                : 'text-ink-500 hover:text-ink-700',
            )}
          >
            {tab.label}
            {active && (
              <span
                aria-hidden="true"
                className="absolute right-4 -bottom-px left-4 h-0.5 rounded-full"
                style={{ backgroundColor: 'var(--amber-500)' }}
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Active rule: prefix-match so `/projects/[id]` keeps the Projects tab
 * lit. Dashboard is the only path that uses an exact match — without it
 * the prefix `/dashboard` would match every nested route under it (none
 * exist today, but this keeps the rule honest).
 */
function isTabActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  return pathname.startsWith(href + '/');
}

// ---------------------------------------------------------------------------
// Property switcher pill (only renders when the client owns 2+ properties)
// ---------------------------------------------------------------------------

function PropertySwitcher({
  propertyId,
  activeProperty,
  properties,
}: {
  propertyId: string;
  activeProperty: PortalHeaderProperty;
  properties: PortalHeaderProperty[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismissOnOutside(ref, open, () => setOpen(false));

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="border-line bg-paper text-ink-700 hover:border-line-2 inline-flex max-w-[240px] items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors sm:gap-2 sm:px-4 sm:py-2"
      >
        <span className="truncate font-medium">{activeProperty.name}</span>
        <ChevronDown
          size={14}
          strokeWidth={1.5}
          className={cn(
            'text-ink-400 flex-shrink-0 transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Switch property"
          className="border-line bg-paper absolute left-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-2xl border"
          style={{ boxShadow: 'var(--shadow-soft-md)' }}
        >
          <ul className="py-1">
            {properties.map((p) => {
              const isActive = p.id === propertyId;
              return (
                <li key={p.id}>
                  <Link
                    href={`/portal/p/${p.id}/dashboard`}
                    onClick={() => setOpen(false)}
                    role="menuitem"
                    className="hover:bg-cream group flex items-center gap-3 px-3 py-2 transition-colors"
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
                        {[p.city, p.state].filter(Boolean).join(', ') || '—'}
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
              onClick={() => setOpen(false)}
              role="menuitem"
              className="text-ink-500 hover:text-ink-900 hover:bg-cream flex items-center justify-between px-4 py-2.5 text-xs uppercase tracking-wider transition-colors"
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
// Notification bell — scrolls to the featured-decision card on the dashboard.
// ---------------------------------------------------------------------------

function NotificationBell({ pendingDecisionCount }: { pendingDecisionCount: number }) {
  const hasPending = pendingDecisionCount > 0;

  function onClick() {
    if (!hasPending) return;
    const target = document.getElementById('featured-decision');
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={
        hasPending
          ? `${pendingDecisionCount} ${pendingDecisionCount === 1 ? 'decision' : 'decisions'} waiting`
          : 'No notifications'
      }
      className="text-ink-700 hover:bg-paper hover:text-ink-900 relative inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors"
    >
      <Bell size={18} strokeWidth={1.5} />
      {hasPending && (
        <span
          className="absolute right-2 top-2 inline-block h-2 w-2 rounded-full"
          style={{ backgroundColor: 'var(--amber-500)' }}
          aria-hidden="true"
        />
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Avatar menu — Edit profile modal + Sign out. There's no standalone
// Account page yet, so the dropdown intentionally has just two items.
// ---------------------------------------------------------------------------

function AvatarMenu({
  user,
  client,
}: {
  user: CurrentUser;
  client: PortalHeaderClient | null;
}) {
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismissOnOutside(ref, open, () => setOpen(false));

  const displayName = client?.name || user.fullName || user.email;
  const initials = initialsFrom(displayName);
  const avatarUrl = client?.avatarUrl ?? null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${displayName}`}
        className="hover:bg-paper inline-flex items-center justify-center rounded-full transition-colors"
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt={displayName}
            className="h-9 w-9 rounded-full object-cover"
          />
        ) : (
          <span
            className="text-paper flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold"
            style={{ backgroundColor: 'var(--teal-700)' }}
          >
            {initials || 'U'}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="border-line bg-paper absolute right-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-xl border py-1"
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
          <form action="/logout" method="POST">
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
  client: PortalHeaderClient;
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
// Shared dropdown dismiss helper — click-outside + Escape.
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
