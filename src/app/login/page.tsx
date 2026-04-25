import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getCurrentUser } from '@/lib/auth/current-user';
import { LoginForm } from './LoginForm';

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
          <div className="mb-6 inline-flex items-center gap-3">
            <div className="bg-brand-teal-500 flex h-12 w-12 items-center justify-center rounded-xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://cdn.prod.website-files.com/6824275111a08fd08762cad9/682450f39c2da996ae7c2f74_4a3e3e9e7263ddc479eb4374e0e0d332_Logo.svg"
                alt="Insight"
                className="h-6 w-6"
              />
            </div>
            <div className="text-left">
              <div className="text-brand-teal-500 font-bold tracking-wider">INSIGHT</div>
              <div className="-mt-1 text-[10px] tracking-widest text-gray-400">
                HOME MAINTENANCE
              </div>
            </div>
          </div>
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
