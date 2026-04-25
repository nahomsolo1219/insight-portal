import { redirect } from 'next/navigation';
import { PortalNav } from '@/components/portal/PortalNav';
import { getCurrentUser } from '@/lib/auth/current-user';

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
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.role !== 'client') redirect('/');

  return (
    <div className="bg-brand-warm-100 min-h-screen text-[#444]">
      <PortalNav user={user} />
      <main className="mx-auto max-w-[900px] px-6 py-10">{children}</main>
    </div>
  );
}
