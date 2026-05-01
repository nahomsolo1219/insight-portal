'use server';

// Bell-feed mutations. Both surfaces (admin header, portal sidebar) call
// these — keeping them in one place avoids the "is this the admin or
// portal action?" ambiguity. RLS would also block cross-user updates,
// but the explicit `recipientUserId = user.id` filter is the first line
// of defence and matches the pattern used everywhere else in the app.
//
// Audit logging is intentionally skipped: a bell-read is not a state
// change worth auditing — it would generate a row every time a user
// clicks a notification, drowning out everything else in the audit
// feed. The notification row's own `read_at` is the audit.

import { and, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { notifications } from '@/db/schema';
import { requireUser } from '@/lib/auth/current-user';
import {
  getUnreadNotificationCount,
  listMyNotifications,
  type NotificationListItem,
} from './queries';

interface ActionResult {
  success: boolean;
  error?: string;
}

/**
 * Mark a single notification as read. No-op if the row doesn't belong
 * to the caller (the WHERE clause filters it out — no error surfaced
 * because that's also the shape we want when the row is already read).
 */
export async function markNotificationRead(notificationId: string): Promise<ActionResult> {
  const user = await requireUser();

  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.recipientUserId, user.id),
        // Skip the write entirely if it's already been read so we don't
        // bump `read_at` on every re-click.
        isNull(notifications.readAt),
      ),
    );

  // Both layouts read the unread count once per request — revalidating
  // each one bumps the bell-badge after the user clicks a row.
  revalidatePath('/admin', 'layout');
  revalidatePath('/portal', 'layout');

  return { success: true };
}

/**
 * Polling endpoint. The bell button on both surfaces (admin header,
 * portal sidebar) calls this every 30s and on `window focus` /
 * dropdown-open to keep its local state fresh — `revalidatePath`
 * alone doesn't push to a currently-rendered SSR layout, and Session 7's
 * "bell badge doesn't refresh in real time" follow-up bug was this
 * exact gap. One round-trip returns both the list (for the dropdown
 * body) and the unread count (for the badge dot) so the polling
 * tick is a single network hop.
 *
 * Returning `{ notifications, unreadCount }` rather than two separate
 * actions keeps the polling cadence atomic — the badge can never go
 * out of sync with the list. RLS still gates the read; the action
 * just bundles two `requireUser()`-scoped queries.
 */
export async function getMyNotificationFeed(): Promise<{
  notifications: NotificationListItem[];
  unreadCount: number;
}> {
  const user = await requireUser();
  const [notificationsList, unreadCount] = await Promise.all([
    listMyNotifications(user.id),
    getUnreadNotificationCount(user.id),
  ]);
  return { notifications: notificationsList, unreadCount };
}

/**
 * Bulk-mark every unread notification belonging to the caller as read.
 * Used by the "Mark all as read" affordance in the bell dropdown.
 */
export async function markAllNotificationsRead(): Promise<ActionResult> {
  const user = await requireUser();

  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(eq(notifications.recipientUserId, user.id), isNull(notifications.readAt)),
    );

  revalidatePath('/admin', 'layout');
  revalidatePath('/portal', 'layout');

  return { success: true };
}
