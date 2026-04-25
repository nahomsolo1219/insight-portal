import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/current-user';

/**
 * Single per-role entry point. The auth callback and unauthenticated
 * middleware redirects all funnel through here, so the dispatch lives in
 * one place rather than being duplicated everywhere.
 */
export default async function RootPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  switch (user.role) {
    case 'admin':
      redirect('/admin');
    case 'client':
      redirect('/portal');
    default:
      // field_staff has no portal yet — bounce to login with a flag so we
      // can show "no access" copy once we wire up the field experience.
      redirect('/login?error=no_portal');
  }
}
