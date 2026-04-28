import { redirect } from 'next/navigation';
import { ToastProvider } from '@/components/admin/ToastProvider';
import { getCurrentUser } from '@/lib/auth/current-user';

/**
 * Outer portal layout. Two responsibilities and nothing else:
 *   1. Gate by role — only `client` users get past here. Admins and field
 *      staff get short-circuited to their own areas so a typed `/portal`
 *      URL doesn't bounce through `/`.
 *   2. Provide the toast context every nested page (landing + per-property
 *      sub-pages) relies on.
 *
 * Visual chrome (PortalSidebar, ContactFab) lives in the per-property
 * layout at `p/[propertyId]/layout.tsx` because the landing page
 * renders its own bg-cream + editorial-light treatment and shouldn't
 * inherit nav scoped to "no property in particular".
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.role === 'admin') redirect('/admin');
  if (user.role === 'field_staff') redirect('/field');
  if (user.role !== 'client' || !user.clientId) redirect('/');

  return <ToastProvider>{children}</ToastProvider>;
}
