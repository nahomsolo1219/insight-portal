import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { NavigationProgress } from '@/components/admin/NavigationProgress';
import { Sidebar } from '@/components/admin/Sidebar';
import { ToastProvider } from '@/components/admin/ToastProvider';
import { getSidebarCounts } from '@/components/admin/queries';
import { getCurrentUser } from '@/lib/auth/current-user';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Belt-and-suspenders: middleware already redirects unauthenticated users,
  // but checking here guarantees the Sidebar always receives a real user.
  // Role gate runs BEFORE getSidebarCounts so a client landing on /admin
  // bounces home without firing admin-only counts under client RLS.
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  // Send each non-admin role straight to its home so the wrong-area URL
  // doesn't pay an extra round-trip through `/`.
  if (user.role === 'client') redirect('/portal');
  if (user.role === 'field_staff') redirect('/field');
  if (user.role !== 'admin') redirect('/');
  const sidebarCounts = await getSidebarCounts();

  // h-screen + overflow-hidden on the shell lets the main pane scroll
  // internally instead of the document. This avoids sticky-positioning
  // gymnastics on the sidebar (and a mis-parented-looking user footer when
  // the page content taller than the viewport).
  return (
    <ToastProvider>
      {/* `useSearchParams` in NavigationProgress requires a Suspense boundary
          to opt out of full-static rendering for the admin layout itself. */}
      <Suspense fallback={null}>
        <NavigationProgress />
      </Suspense>
      <div className="bg-cream flex h-screen overflow-hidden text-ink-700">
        <Sidebar user={user} counts={sidebarCounts} />
        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1200px] px-8 py-8">{children}</div>
        </main>
      </div>
    </ToastProvider>
  );
}
