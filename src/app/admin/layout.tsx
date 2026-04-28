import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { AdminHeader } from '@/components/admin/AdminHeader';
import { NavigationProgress } from '@/components/admin/NavigationProgress';
import { Sidebar } from '@/components/admin/Sidebar';
import { ToastProvider } from '@/components/admin/ToastProvider';
import { getSidebarCounts } from '@/components/admin/queries';
import { getCurrentUser } from '@/lib/auth/current-user';
import { getActiveClientsForProjectPicker } from './queries';
import { getClientFormOptions } from './clients/queries';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Belt-and-suspenders: middleware already redirects unauthenticated users,
  // but checking here guarantees the Sidebar always receives a real user.
  // Role gate runs BEFORE the chrome-data Promise.all so a client landing on
  // /admin bounces home without firing admin-only counts under client RLS.
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.role === 'client') redirect('/portal');
  if (user.role === 'field_staff') redirect('/field');
  if (user.role !== 'admin') redirect('/');

  // Header + sidebar both need server-fetched data once per request.
  // Promise.all keeps it to a single round-trip.
  const [sidebarCounts, formOptions, projectPickerClients] = await Promise.all([
    getSidebarCounts(),
    getClientFormOptions(),
    getActiveClientsForProjectPicker(),
  ]);

  // Date label refreshes on each request — long-open tabs won't see today
  // tick over without a navigation, but admins get a fresh value on every
  // page load.
  const dateLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  // Layout shell: header on top, then sidebar + main pane below.
  // h-screen + overflow-hidden lets the main pane scroll internally; the
  // header + sidebar stay fixed in viewport.
  return (
    <ToastProvider>
      <Suspense fallback={null}>
        <NavigationProgress />
      </Suspense>
      <div className="bg-cream flex h-screen flex-col overflow-hidden text-ink-700">
        <AdminHeader
          user={user}
          dateLabel={dateLabel}
          tiers={formOptions.tiers}
          pms={formOptions.pms}
          projectPickerClients={projectPickerClients}
        />
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <Sidebar user={user} counts={sidebarCounts} />
          <main className="min-w-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-[1200px] px-8 py-8">{children}</div>
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
