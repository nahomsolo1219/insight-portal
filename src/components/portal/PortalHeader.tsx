'use client';

import {
  Bell,
  Briefcase,
  Calendar,
  Check,
  ChevronDown,
  FileText,
  LogOut,
  MoreVertical,
  Pencil,
  Receipt,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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

const OVERFLOW_LINKS: ReadonlyArray<{
  segment: 'projects' | 'appointments' | 'documents' | 'invoices';
  label: string;
  icon: typeof Briefcase;
}> = [
  { segment: 'projects', label: 'Projects', icon: Briefcase },
  { segment: 'appointments', label: 'Appointments', icon: Calendar },
  { segment: 'documents', label: 'Documents', icon: FileText },
  { segment: 'invoices', label: 'Invoices', icon: Receipt },
];

/**
 * Editorial chrome for the per-property portal. Replaces the older
 * `PortalNav` top-tab pattern with a quieter cream header — wordmark on
 * the left, optional property switcher pill, then overflow menu / bell /
 * avatar on the right. Phase 2B-1 of the client-portal redesign.
 *
 * The bell is the only notifications affordance — clicking it smooth-
 * scrolls to the dashboard's `#featured-decision` anchor when there's a
 * pending decision, and is a no-op otherwise. We intentionally do not
 * route to a separate notifications page.
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
      <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-3 px-4 sm:h-[68px] sm:gap-4 sm:px-6">
        <Link
          href="/portal"
          className="text-ink-900 inline-flex items-baseline text-xl font-light tracking-tight sm:text-2xl"
          aria-label="Insight HM — back to all homes"
        >
          Insight
          <span className="text-amber-600 mx-px" aria-hidden="true">
            ·
          </span>
          HM
        </Link>

        {showSwitcher && activeProperty && (
          <PropertySwitcher
            propertyId={propertyId}
            activeProperty={activeProperty}
            properties={properties}
          />
        )}

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <OverflowMenu propertyId={propertyId} />
          <NotificationBell pendingDecisionCount={pendingDecisionCount} />
          <AvatarMenu user={user} client={client} />
        </div>
      </div>
    </header>
  );
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
// Overflow menu — secondary pages live behind the three-dot icon.
// ---------------------------------------------------------------------------

function OverflowMenu({ propertyId }: { propertyId: string }) {
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
        aria-label="More"
        className="text-ink-700 hover:bg-paper hover:text-ink-900 inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors"
      >
        <MoreVertical size={18} strokeWidth={1.5} />
      </button>
      {open && (
        <div
          role="menu"
          className="border-line bg-paper absolute right-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-xl border py-1"
          style={{ boxShadow: 'var(--shadow-soft-md)' }}
        >
          {OVERFLOW_LINKS.map(({ segment, label, icon: Icon }) => (
            <Link
              key={segment}
              href={`/portal/p/${propertyId}/${segment}`}
              onClick={() => setOpen(false)}
              role="menuitem"
              className="text-ink-700 hover:bg-cream hover:text-ink-900 flex items-center gap-2.5 px-3 py-2 text-sm transition-colors"
            >
              <Icon size={14} strokeWidth={1.5} className="text-ink-400" />
              {label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Avatar menu — Edit profile modal + Sign out (matching the prior PortalNav
// precedent — there's no standalone Account page yet).
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
// Edit profile modal — same shape as the legacy PortalNav modal so the
// existing updateMyProfile server action keeps working unchanged.
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
