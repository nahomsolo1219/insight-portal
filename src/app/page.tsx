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
    case 'field_staff':
      redirect('/field');
    default:
      // Defensive fallback for an unknown role — shouldn't happen since
      // the user_role enum is exhaustive, but TypeScript wants the case.
      redirect('/login?error=unknown_role');
  }
}
