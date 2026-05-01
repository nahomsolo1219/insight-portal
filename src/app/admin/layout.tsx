import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { AdminHeader } from '@/components/admin/AdminHeader';
import { NavigationProgress } from '@/components/admin/NavigationProgress';
import { Sidebar } from '@/components/admin/Sidebar';
import { ToastProvider } from '@/components/admin/ToastProvider';
import { getSidebarCounts } from '@/components/admin/queries';
import {
  getUnreadNotificationCount,
  listMyNotifications,
} from '@/app/notifications/queries';
import { getCurrentUser } from '@/lib/auth/current-user';
import { getAvatarPublicUrl } from '@/lib/storage/upload';
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
  // Promise.all keeps it to a single round-trip. Notifications are
  // fetched here so the bell badge + dropdown are warm on every page —
  // the mark-read actions revalidate this layout to keep them honest.
  const [
    sidebarCounts,
    formOptions,
    projectPickerClients,
    notifications,
    unreadNotificationCount,
  ] = await Promise.all([
    getSidebarCounts(),
    getClientFormOptions(),
    getActiveClientsForProjectPicker(),
    listMyNotifications(user.id),
    getUnreadNotificationCount(user.id),
  ]);

  // The avatarUrl on `user` is a storage *path*, not a public URL —
  // compose the URL once here so the header + sidebar can render the
  // image without each one running its own composition. Cache-bust
  // off `profiles.updatedAt` (which the upload action bumps), so the
  // URL changes only when the avatar actually changes — important
  // for CDN edge rotation and for the lint rule that bans impure
  // calls (Date.now) during render.
  const avatarPublicUrl = user.avatarUrl
    ? getAvatarPublicUrl(user.avatarUrl, user.updatedAt.getTime())
    : null;

  // Date label refreshes on each request — long-open tabs won't see today
  // tick over without a navigation, but admins get a fresh value on every
  // page load. Two parallel formats: the full label sits in the header on
  // sm+, and the abbreviated `Apr 28, 2026` form takes over on narrower
  // viewports where the full string would crowd.
  const now = new Date();
  const dateLabel = now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const dateLabelShort = now.toLocaleDateString('en-US', {
    month: 'short',
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
          avatarPublicUrl={avatarPublicUrl}
          dateLabel={dateLabel}
          dateLabelShort={dateLabelShort}
          tiers={formOptions.tiers}
          pms={formOptions.pms}
          projectPickerClients={projectPickerClients}
          notifications={notifications}
          unreadNotificationCount={unreadNotificationCount}
        />
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <Sidebar user={user} avatarPublicUrl={avatarPublicUrl} counts={sidebarCounts} />
          <main className="min-w-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-[1200px] px-8 py-8">{children}</div>
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
