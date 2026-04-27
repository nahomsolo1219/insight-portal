import { and, eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { ContactFab } from '@/components/portal/ContactFab';
import { PortalNav } from '@/components/portal/PortalNav';
import { db } from '@/db';
import { clients, properties } from '@/db/schema';
import { requireUser } from '@/lib/auth/current-user';
import { getSignedUrl } from '@/lib/storage/upload';
import { getMyClientProfile, getPortalBadgeCounts } from '../../queries';

interface Props {
  children: React.ReactNode;
  params: Promise<{ propertyId: string }>;
}

/**
 * Per-property portal chrome. Validates the URL's `propertyId` belongs to
 * the authenticated client (a forged URL bounces back to `/portal` rather
 * than 404ing — the landing page knows what to do next), then loads the
 * client/profile/badge data PortalNav + ContactFab need.
 *
 * Auth gating already happened in the outer `/portal/layout.tsx`; here we
 * only deal with property scoping.
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

  // Three parallel reads, same pattern the layout used pre-redesign.
  const [clientRow, profile, badges] = await Promise.all([
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
    getMyClientProfile(user.clientId),
    getPortalBadgeCounts(user.clientId),
  ]);

  const avatarUrl = clientRow?.avatarStoragePath
    ? await getSignedUrl(clientRow.avatarStoragePath)
    : null;

  return (
    <div className="bg-brand-warm-100 min-h-screen text-[#444]">
      <PortalNav
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
        badges={badges}
        propertyId={propertyId}
      />
      <main className="mx-auto max-w-[900px] px-6 pt-10 pb-24 md:pb-10">{children}</main>
      <ContactFab
        pmName={profile?.assignedPmName ?? null}
        pmEmail={profile?.assignedPmEmail ?? null}
        pmPhone={profile?.assignedPmPhone ?? null}
      />
    </div>
  );
}
