// Server-only helper used by every existing Server Action that wants to
// drop a row into the bell feed. Notifications are best-effort: if this
// helper throws, the caller's primary mutation must still succeed —
// callers wrap the call in try/catch and the helper itself catches its
// own DB error so a broken feed never blocks the user. Mirrors the
// philosophy of `logAudit` in src/lib/audit.ts.
//
// `recipient_user_id` references `auth.users.id` (not `profiles.id`) so
// the table is role-agnostic — admin / client / field_staff all work.
// Drizzle's connection bypasses RLS, so we don't need the service-role
// supabase client here; a plain `db.insert(...)` is enough.

import 'server-only';

import { db } from '@/db';
import { notifications } from '@/db/schema';

/**
 * Discriminated set of well-known notification kinds. Stored on the row
 * as plain text so adding a new kind doesn't require a migration; this
 * union is the type-safety layer at the edges (callers pass it, queries
 * narrow on it).
 *
 * Adding a kind: extend this union and the UI's title/icon resolver in
 * src/components/notifications/NotificationsDropdown.tsx (or wherever
 * the bell is rendered).
 */
export type NotificationKind =
  | 'decision_pushed'
  | 'decision_answered'
  | 'photo_uploaded'
  | 'invoice_uploaded'
  | 'appointment_scheduled';

/**
 * Loose entity-type label for the row's optional related-entity fields.
 * Powers grouping / filtering in future iterations; today it's metadata
 * only so the UI doesn't need it for rendering.
 */
export type NotificationEntityType =
  | 'decision'
  | 'photo_batch'
  | 'invoice'
  | 'appointment';

export interface CreateNotificationInput {
  recipientUserId: string;
  kind: NotificationKind;
  /** Plain sentence — "Mike uploaded 3 new photos". */
  title: string;
  /** Optional one-line context shown beneath the title. */
  body?: string;
  /** Internal href the row should navigate to on click. */
  link?: string;
  relatedEntityType?: NotificationEntityType;
  relatedEntityId?: string;
}

/**
 * Insert a notification. Never throws — caller's mutation succeeds even
 * if the feed write fails. Returns void to enforce that callers don't
 * rely on the row id (the feed is fire-and-forget).
 */
export async function createNotification(input: CreateNotificationInput): Promise<void> {
  try {
    await db.insert(notifications).values({
      recipientUserId: input.recipientUserId,
      kind: input.kind,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
      relatedEntityType: input.relatedEntityType ?? null,
      relatedEntityId: input.relatedEntityId ?? null,
    });
  } catch (error) {
    // Intentionally swallowed — see module header.
    console.error('[notifications.create]', input.kind, error);
  }
}
