'use client';

// Shared notification panel used by the admin header bell and the
// portal sidebar bell. Lives in `components/admin/` per the design-
// system convention that "anything used across surfaces stays here"
// (the directory name is historical — see DESIGN_SYSTEM.md).
//
// Presentational + interaction-stateful. Parents pass:
//   - `notifications`: live list, owned by the bell button (which
//     polls + caches). The dropdown never refetches itself — that's
//     the bell's job.
//   - `unreadCount`: same source.
//   - `open` / `onClose`: parent owns open/close so the bell
//     trigger and the panel can sit in different DOM subtrees.
//   - `anchor`: 'right-below' for the admin header, 'right-of-bottom'
//     for the portal sidebar.
//   - `onMarkOneRead(id)` / `onMarkAllRead()`: optimistic-update
//     callbacks. The dropdown calls them BEFORE the server action
//     so the badge / row state flips instantly; the server action
//     fires in parallel for persistence.
//
// Click on a row → optimistic flip → server mark-read → navigate
// to the link. Mark-all-read does the same fan-out.

import { Bell } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import {
  markAllNotificationsRead,
  markNotificationRead,
} from '@/app/notifications/actions';
import type { NotificationListItem } from '@/app/notifications/queries';
import { cn } from '@/lib/utils';

export type DropdownAnchor = 'right-below' | 'right-of-bottom';

interface NotificationsDropdownProps {
  notifications: NotificationListItem[];
  unreadCount: number;
  open: boolean;
  onClose: () => void;
  anchor: DropdownAnchor;
  /** Parent-supplied optimistic update — flip a single row to read
   *  before the server action returns so the badge drops instantly. */
  onMarkOneRead: (notificationId: string) => void;
  /** Parent-supplied optimistic update — clear every unread row. */
  onMarkAllRead: () => void;
}

const ANCHOR_CLASS: Record<DropdownAnchor, string> = {
  // Admin header bell — sits at top-right; panel drops down-right.
  'right-below': 'absolute right-0 top-full mt-2',
  // Portal sidebar bell — sits at bottom-left of viewport; panel
  // opens to the right of the sidebar, bottom-aligned with the row.
  'right-of-bottom': 'fixed left-64 bottom-20 ml-2',
};

export function NotificationsDropdown({
  notifications,
  unreadCount,
  open,
  onClose,
  anchor,
  onMarkOneRead,
  onMarkAllRead,
}: NotificationsDropdownProps) {
  // Esc-to-close — same affordance modals + dropdowns elsewhere use.
  // useTransition lives in the panel-body subcomponents, so we don't
  // need an effect to register the listener conditionally; rendering
  // null when !open already gates everything.
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="Notifications"
      className={cn(
        'bg-paper border-line shadow-soft-lg z-50 w-96 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border',
        ANCHOR_CLASS[anchor],
      )}
      // Stop click-through so click-outside detection at the parent
      // doesn't fire when the user interacts with the panel itself.
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <DropdownHeader
        unreadCount={unreadCount}
        onMarkAllRead={onMarkAllRead}
      />
      <DropdownBody
        notifications={notifications}
        onClose={onClose}
        onMarkOneRead={onMarkOneRead}
      />
      <DropdownFooter onClose={onClose} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header — title + Mark-all-read affordance.
// ---------------------------------------------------------------------------

function DropdownHeader({
  unreadCount,
  onMarkAllRead,
}: {
  unreadCount: number;
  onMarkAllRead: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  function markAll() {
    if (unreadCount === 0) return;
    // Optimistic flip first so the badge drops the instant the user
    // clicks; server roundtrip happens in parallel.
    onMarkAllRead();
    startTransition(async () => {
      await markAllNotificationsRead();
    });
  }

  return (
    <div className="border-line bg-cream flex items-center justify-between border-b px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="text-ink-900 text-sm font-medium tracking-tight">
          Notifications
        </span>
        {unreadCount > 0 && (
          <span className="bg-brand-gold-100 text-brand-gold-700 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </div>
      {unreadCount > 0 && (
        <button
          type="button"
          onClick={markAll}
          disabled={isPending}
          className="text-ink-500 hover:text-ink-900 text-xs font-medium transition-colors disabled:opacity-50"
        >
          Mark all as read
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Body — list of rows or empty state.
// ---------------------------------------------------------------------------

function DropdownBody({
  notifications,
  onClose,
  onMarkOneRead,
}: {
  notifications: NotificationListItem[];
  onClose: () => void;
  onMarkOneRead: (id: string) => void;
}) {
  if (notifications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
        <Bell size={20} strokeWidth={1.5} className="text-ink-300 mb-2" />
        <p className="text-ink-500 text-sm">You&apos;re all caught up.</p>
      </div>
    );
  }

  return (
    <ul className="divide-line-2 max-h-[420px] divide-y overflow-y-auto">
      {notifications.map((n) => (
        <NotificationRow
          key={n.id}
          notification={n}
          onClose={onClose}
          onMarkOneRead={onMarkOneRead}
        />
      ))}
    </ul>
  );
}

function NotificationRow({
  notification,
  onClose,
  onMarkOneRead,
}: {
  notification: NotificationListItem;
  onClose: () => void;
  onMarkOneRead: (id: string) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function onClick() {
    // Optimistic flip first — the badge drops + the row de-emphasises
    // before the network roundtrip lands.
    if (!notification.isRead) {
      onMarkOneRead(notification.id);
    }
    startTransition(async () => {
      if (!notification.isRead) {
        await markNotificationRead(notification.id);
      }
      if (notification.link) {
        router.push(notification.link);
      }
      onClose();
    });
  }

  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        disabled={isPending}
        className={cn(
          'group flex w-full items-start gap-3 px-4 py-3 text-left transition-colors',
          notification.isRead ? 'hover:bg-cream' : 'bg-cream hover:bg-ivory',
        )}
      >
        {/* Unread indicator — small amber dot, hidden once read so
            the user can still see what they've already opened. */}
        <span
          aria-hidden="true"
          className={cn(
            'mt-1.5 h-2 w-2 flex-shrink-0 rounded-full',
            notification.isRead ? 'bg-transparent' : 'bg-brand-gold-500',
          )}
        />
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              'truncate text-sm',
              notification.isRead
                ? 'text-ink-700 font-normal'
                : 'text-ink-900 font-medium',
            )}
          >
            {notification.title}
          </div>
          {notification.body && (
            <div className="text-ink-500 mt-0.5 truncate text-xs">
              {notification.body}
            </div>
          )}
          <div className="text-ink-400 mt-1 text-[11px]">
            {formatRelativeTime(notification.createdAt)}
          </div>
        </div>
      </button>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Footer — placeholder "View all" link. The full-page notifications
// route is out of scope for Session 7; the link no-ops gracefully by
// closing the panel until that surface ships.
// ---------------------------------------------------------------------------

function DropdownFooter({ onClose }: { onClose: () => void }) {
  return (
    <div className="border-line bg-cream flex items-center justify-center border-t px-4 py-2.5">
      <button
        type="button"
        onClick={onClose}
        className="text-ink-500 hover:text-ink-900 text-xs font-medium transition-colors"
        title="A dedicated notifications page is on the polish list."
      >
        View all
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Relative-time helper — kept inline so we don't drag in a date library
// for one cosmetic string. Bands of resolution: minutes → hours → days
// → fall back to the absolute date.
// ---------------------------------------------------------------------------

function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const then = date.getTime();
  const diffSec = Math.max(0, Math.round((now - then) / 1000));

  if (diffSec < 45) return 'just now';
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} ${diffMin === 1 ? 'minute' : 'minutes'} ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} ${diffHr === 1 ? 'hour' : 'hours'} ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay} ${diffDay === 1 ? 'day' : 'days'} ago`;
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
