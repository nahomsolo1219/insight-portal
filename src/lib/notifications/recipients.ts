// Helpers that resolve domain ids (a `clients.id`, a `projects.id`) to
// the auth user ids that should receive a notification. One module
// keeps the lookup logic in one place — every existing action that
// fires a notification pulls from here so the recipient set is
// consistent across the surface.

import 'server-only';

import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { profiles } from '@/db/schema';

/**
 * Every portal-user profile attached to the given client. Returns an
 * empty array if the client hasn't been invited to the portal yet
 * (callers should treat that as "no notification to send" and
 * continue, not as an error).
 *
 * Multiple profiles per client are valid — a household could invite
 * a spouse later — so we always notify everyone with the link to
 * keep the bell honest for both accounts.
 */
export async function getClientRecipientUserIds(clientId: string): Promise<string[]> {
  const rows = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.clientId, clientId));
  return rows.filter((r) => r.id).map((r) => r.id);
}

/**
 * Every active admin profile. Used when the recipient is "the people
 * watching the dashboard" rather than a specific PM — e.g. when a
 * client responds to a decision the *whole* admin team should see
 * the bell light up. Today the role gate is `'admin'`; if a future
 * spec adds a "primary PM" column on `clients.assignedPmId` we can
 * narrow this here without touching every caller.
 */
export async function getAdminRecipientUserIds(): Promise<string[]> {
  const rows = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.role, 'admin'));
  return rows.filter((r) => r.id).map((r) => r.id);
}
