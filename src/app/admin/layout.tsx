import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/admin/Sidebar';
import { getSidebarCounts } from '@/components/admin/queries';
import { getCurrentUser } from '@/lib/auth/current-user';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Belt-and-suspenders: middleware already redirects unauthenticated users,
  // but checking here guarantees the Sidebar always receives a real user.
  const [user, sidebarCounts] = await Promise.all([getCurrentUser(), getSidebarCounts()]);
  if (!user) redirect('/login');

  // h-screen + overflow-hidden on the shell lets the main pane scroll
  // internally instead of the document. This avoids sticky-positioning
  // gymnastics on the sidebar (and a mis-parented-looking user footer when
  // the page content taller than the viewport).
  return (
    <div className="bg-brand-warm-100 flex h-screen overflow-hidden text-[#444]">
      <Sidebar user={user} counts={sidebarCounts} />
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1200px] px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
