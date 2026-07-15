import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { BrandLockup } from '@/components/BrandLockup';
import { getCurrentUser } from '@/lib/auth/current-user';
import { LoginForm } from './LoginForm';

// Neutral, audience-appropriate title — a client signing in must never see
// "Admin". (reset-password is a client component and can't export metadata, so
// it inherits the root's neutral "Insight HM" default, which is also fine.)
export const metadata: Metadata = {
  title: 'Insight HM — Sign in',
};

// The form uses useSearchParams, which requires a Suspense boundary during
// static rendering. Keep the page shell as a Server Component.
export default async function LoginPage() {
  // If the user is already signed in, kick them to their per-role home so
  // they don't have to re-auth just to land on the right page.
  const user = await getCurrentUser();
  if (user) {
    if (user.role === 'admin') redirect('/admin');
    if (user.role === 'client') redirect('/portal');
    // Field staff falls through to the form for now.
  }
  return (
    <div className="bg-brand-warm-100 flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <BrandLockup />
          <h1 className="font-display text-brand-teal-500 mb-2 text-3xl">Welcome back</h1>
          <p className="text-sm text-gray-500">Sign in to your account</p>
        </div>

        <div className="shadow-card rounded-2xl bg-white p-8">
          <Suspense fallback={<div className="h-48 animate-pulse rounded-xl bg-gray-50" />}>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
