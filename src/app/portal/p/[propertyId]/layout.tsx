import { and, asc, eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import {
  getUnreadNotificationCount,
  listMyNotifications,
} from '@/app/notifications/queries';
import { PortalSidebar } from '@/components/portal/PortalSidebar';
import { db } from '@/db';
import { clients, properties } from '@/db/schema';
import { requireUser } from '@/lib/auth/current-user';
import { getSignedUrl } from '@/lib/storage/upload';

interface Props {
  children: React.ReactNode;
  params: Promise<{ propertyId: string }>;
}

/**
 * Per-property portal chrome. Validates the URL's `propertyId` belongs to
 * the authenticated client (a forged URL bounces back to `/portal` rather
 * than 404ing — the landing page knows what to do next), then loads the
 * client/profile data the sidebar needs.
 *
 * Auth gating already happened in the outer `/portal/layout.tsx`; here we
 * only deal with property scoping. PortalSidebar (dark teal column with
 * logo, property switcher pill, nav, notifications, and profile menu)
 * lives at the left edge of every property-scoped page; the page bodies
 * render on `bg-cream` to its right.
 */
export default async function PortalPropertyLayout({ children, params }: Props) {
  const { propertyId } = await params;
  const user = await requireUser();
  if (user.role !== 'client' || !user.clientId) redirect('/');

  // Ownership check: row exists AND belongs to this client. Either miss
  // routes back to the landing — RLS would also block the read but the
  // explicit redirect keeps the URL honest.
  const [property] = await db
    .select({ id: properties.id })
    .from(properties)
    .where(and(eq(properties.id, propertyId), eq(properties.clientId, user.clientId)))
    .limit(1);
  if (!property) redirect('/portal');

  // Four parallel reads. The properties list drives the sidebar's
  // switcher pill (only opens a dropdown when ≥ 2); the notifications
  // pair drives the bell badge + dropdown panel (real data as of
  // Session 7 — replaces the prior pending-decision proxy); the
  // client row hydrates the sidebar profile chip.
  const [clientRow, propertyRows, notifications, unreadNotificationCount] =
    await Promise.all([
      db
        .select({
          id: clients.id,
          name: clients.name,
          email: clients.email,
          phone: clients.phone,
          avatarStoragePath: clients.avatarStoragePath,
        })
        .from(clients)
        .where(eq(clients.id, user.clientId))
        .limit(1)
        .then((rows) => rows[0] ?? null),
      db
        .select({
          id: properties.id,
          name: properties.name,
          region: properties.region,
          city: properties.city,
          state: properties.state,
          coverPhotoUrl: properties.coverPhotoUrl,
          coverPhotoUploadedAt: properties.coverPhotoUploadedAt,
        })
        .from(properties)
        .where(eq(properties.clientId, user.clientId))
        .orderBy(asc(properties.name)),
      listMyNotifications(user.id),
      getUnreadNotificationCount(user.id),
    ]);

  const avatarUrl = clientRow?.avatarStoragePath
    ? await getSignedUrl(clientRow.avatarStoragePath)
    : null;

  // `md:pl-64` reserves the desktop column the fixed-position sidebar
  // occupies. On mobile the sidebar is hidden off-canvas (drawer mode),
  // so no padding is needed — content goes edge-to-edge under the
  // mobile top bar that PortalSidebar also renders.
  return (
    <div className="bg-cream min-h-screen text-ink-700 md:pl-64">
      <PortalSidebar
        user={user}
        client={
          clientRow
            ? {
                id: clientRow.id,
                name: clientRow.name,
                email: clientRow.email,
                phone: clientRow.phone,
                avatarUrl,
              }
            : null
        }
        propertyId={propertyId}
        properties={propertyRows}
        notifications={notifications}
        unreadNotificationCount={unreadNotificationCount}
      />
      <main className="mx-auto max-w-[1200px] px-6 pt-10 pb-24 md:pb-10">{children}</main>
    </div>
  );
}
