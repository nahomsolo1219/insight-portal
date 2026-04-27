import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { ToastProvider } from '@/components/admin/ToastProvider';
import { ContactFab } from '@/components/portal/ContactFab';
import { PortalNav } from '@/components/portal/PortalNav';
import { db } from '@/db';
import { clients } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth/current-user';
import { getSignedUrl } from '@/lib/storage/upload';
import { getMyClientProfile, getPortalBadgeCounts } from './queries';

/**
 * Wrapping layout for the client portal. Every nested page inherits the
 * top-nav chrome and the narrower 900px content column — deliberately
 * narrower than the admin layout so the portal feels like a curated
 * concierge experience instead of a data-table dashboard.
 *
 * Auth: middleware guarantees the user is signed in by the time this
 * runs, but we gate by role here as the source-of-truth check. Anyone
 * who isn't a `client` gets routed back through the home dispatcher,
 * which sends admins to /admin and field staff to login.
 *
 * Loads the client's name + contact + avatar so PortalNav can render the
 * user chip and host the "Edit profile" modal without an extra fetch.
 * One small SELECT on top of `getCurrentUser` — cached by the request.
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  // Direct shortcuts to the right area for non-client roles so a typed
  // `/portal` URL doesn't bounce through `/`.
  if (user.role === 'admin') redirect('/admin');
  if (user.role === 'field_staff') redirect('/field');
  if (user.role !== 'client' || !user.clientId) redirect('/');

  // Three parallel reads: the client header chip, the PM contact card for
  // the FAB, and the unread/unpaid/pending counts for the nav badges.
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

  // Sign the avatar at read time so the URL stays fresh on each render.
  const avatarUrl = clientRow?.avatarStoragePath
    ? await getSignedUrl(clientRow.avatarStoragePath)
    : null;

  return (
    <ToastProvider>
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
        />
        {/* pb-24 reserves room for the fixed mobile bottom tab bar so the
            last card on the page doesn't sit underneath it. md:pb-10 drops
            back to the original spacing once the tabs are hidden. */}
        <main className="mx-auto max-w-[900px] px-6 pt-10 pb-24 md:pb-10">{children}</main>
        <ContactFab
          pmName={profile?.assignedPmName ?? null}
          pmEmail={profile?.assignedPmEmail ?? null}
          pmPhone={profile?.assignedPmPhone ?? null}
        />
      </div>
    </ToastProvider>
  );
}
