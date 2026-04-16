import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/admin/Sidebar';
import { getCurrentUser } from '@/lib/auth/current-user';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Belt-and-suspenders: middleware already redirects unauthenticated users,
  // but checking here guarantees the Sidebar always receives a real user.
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return (
    <div className="bg-brand-warm-100 flex min-h-screen text-[#444]">
      <Sidebar user={user} />
      <main className="min-w-0 flex-1 overflow-x-hidden">
        <div className="mx-auto w-full max-w-[1200px] px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
