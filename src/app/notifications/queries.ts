// Read queries powering the notification bell on both admin and portal
// surfaces. Pure reads, no auth gating — callers are server components
// that already passed `requireUser()`. Filtering by recipient is the
// caller's responsibility (or RLS, which enforces "see only your own"
// for client/field_staff via the SELECT policy on the table).
//
// Both functions take an explicit `userId` so the same module works
// from any layout / page without hidden header reads.

import 'server-only';

import { and, count, desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { notifications } from '@/db/schema';
import type { NotificationKind } from '@/lib/notifications/create';

export interface NotificationListItem {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  link: string | null;
  isRead: boolean;
  createdAt: Date;
}

/**
 * Latest `limit` notifications for the given user, newest first.
 * Default 20 — enough for the bell dropdown without paginating; the
 * full-page list (out of scope for Session 7) will need a cursor.
 */
export async function listMyNotifications(
  userId: string,
  limit = 20,
): Promise<NotificationListItem[]> {
  const rows = await db
    .select({
      id: notifications.id,
      kind: notifications.kind,
      title: notifications.title,
      body: notifications.body,
      link: notifications.link,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(eq(notifications.recipientUserId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    // Cast at the read edge — `kind` is `text` in the DB so adding a new
    // kind doesn't require a migration; callers always see a typed
    // value.
    kind: r.kind as NotificationKind,
    title: r.title,
    body: r.body,
    link: r.link,
    isRead: r.readAt !== null,
    createdAt: r.createdAt,
  }));
}

/**
 * Count unread notifications for the bell badge. Backed by the
 * partial index `notifications_recipient_unread_idx` so this stays
 * cheap even after a long history accumulates.
 */
export async function getUnreadNotificationCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(notifications)
    .where(and(eq(notifications.recipientUserId, userId), isNull(notifications.readAt)));
  return row?.value ?? 0;
}
