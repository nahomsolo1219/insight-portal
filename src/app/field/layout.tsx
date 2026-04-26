import { LogOut } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/current-user';

/**
 * Field staff layout. Mobile-first, full-bleed — no sidebar, no bottom
 * tabs, no chrome competing with the photo workflow.
 *
 * Auth: middleware already gates unauthenticated traffic. Here we widen
 * to admins (for testing) and strictly forbid clients — the field
 * surface intentionally exposes other clients' properties as part of the
 * "any field tech can be dispatched anywhere" workflow.
 */
export default async function FieldLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.role === 'client') redirect('/portal');
  if (user.role !== 'field_staff' && user.role !== 'admin') redirect('/');

  const displayName = user.fullName || user.email;

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 text-gray-900">
      <header className="bg-brand-teal-500 safe-area-top text-white">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="inline-flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://cdn.prod.website-files.com/6824275111a08fd08762cad9/682450f39c2da996ae7c2f74_4a3e3e9e7263ddc479eb4374e0e0d332_Logo.svg"
              alt="Insight"
              className="h-5 w-5"
            />
            <span className="text-sm font-bold tracking-wider">INSIGHT</span>
          </div>
          <div className="inline-flex items-center gap-3">
            <span className="hidden text-xs text-white/70 sm:inline">{displayName}</span>
            <form action="/logout" method="POST">
              <button
                type="submit"
                aria-label="Sign out"
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-white/60 transition-colors hover:bg-white/10 hover:text-white"
              >
                <LogOut size={12} strokeWidth={1.75} />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="safe-area-bottom flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
