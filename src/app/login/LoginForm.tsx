'use client';

import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();
  const next = searchParams.get('next') ?? '/admin';
  const initialError = searchParams.get('error');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });

    setLoading(false);

    if (otpError) {
      setError(otpError.message);
    } else {
      setSent(true);
    }
  }

  if (sent) {
    return (
      <div className="py-4 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
          <svg
            className="h-6 w-6 text-emerald-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <h2 className="mb-2 font-semibold text-gray-900">Check your email</h2>
        <p className="text-sm text-gray-500">
          We sent a magic link to <strong>{email}</strong>. Click the link to sign in.
        </p>
        <button
          type="button"
          onClick={() => setSent(false)}
          className="text-brand-gold-400 hover:text-brand-gold-500 mt-6 text-sm font-medium"
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label
          htmlFor="login-email"
          className="mb-2 block text-xs font-semibold tracking-wider text-gray-500 uppercase"
        >
          Email
        </label>
        <input
          id="login-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="focus:ring-brand-teal-200 focus:border-brand-teal-400 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm transition-all outline-none focus:ring-2"
        />
      </div>

      {(error ?? initialError) && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error ??
            (initialError === 'auth_failed'
              ? 'That magic link is invalid or expired. Try again.'
              : 'Something went wrong. Try again.')}
        </div>
      )}

      <button
        type="submit"
        disabled={loading || !email}
        className="bg-brand-gold-400 hover:bg-brand-gold-500 shadow-soft w-full rounded-xl px-5 py-3 font-medium text-white transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? 'Sending...' : 'Send magic link'}
      </button>

      <p className="text-center text-xs text-gray-400">
        We&apos;ll email you a link to sign in. No password required.
      </p>
    </form>
  );
}
