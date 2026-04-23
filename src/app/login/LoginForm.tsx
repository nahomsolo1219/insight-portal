'use client';

import { CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Mode =
  | { kind: 'form' }
  | { kind: 'magic-link-sent'; email: string }
  | { kind: 'reset-sent'; email: string };

/**
 * Dual-path login:
 *   1. Password sign-in (primary) — faster for repeat visits
 *   2. Magic link (secondary) — works without remembering a password
 *   3. Forgot password — sends a recovery email that lands on /auth/reset-password
 *
 * All three paths share the same email input. The rest of the UI swaps
 * based on which button was used.
 */
export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') ?? '/admin';
  const initialError = searchParams.get('error');

  const [mode, setMode] = useState<Mode>({ kind: 'form' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<null | 'password' | 'magic' | 'reset'>(null);

  async function handlePasswordSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return;
    setError(null);
    setLoading('password');

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(null);

    if (signInError) {
      setError(signInError.message);
      return;
    }
    router.replace(next);
    router.refresh();
  }

  async function handleMagicLink() {
    if (!email) {
      setError('Enter your email first.');
      return;
    }
    setError(null);
    setLoading('magic');

    const supabase = createClient();
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });

    setLoading(null);

    if (otpError) {
      setError(otpError.message);
      return;
    }
    setMode({ kind: 'magic-link-sent', email });
  }

  async function handleForgotPassword() {
    if (!email) {
      setError('Enter your email first, then click "Forgot password?".');
      return;
    }
    setError(null);
    setLoading('reset');

    const supabase = createClient();
    // Supabase sends a recovery email whose link lands on /auth/callback
    // with a code; we pipe `next` through to /auth/reset-password so the
    // user can set a new password with an authed session.
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset-password`,
    });

    setLoading(null);

    if (resetError) {
      setError(resetError.message);
      return;
    }
    setMode({ kind: 'reset-sent', email });
  }

  // ---------- "check your email" screens ----------

  if (mode.kind === 'magic-link-sent' || mode.kind === 'reset-sent') {
    const heading =
      mode.kind === 'magic-link-sent' ? 'Check your email' : 'Reset link sent';
    const body =
      mode.kind === 'magic-link-sent'
        ? 'Click the magic link to sign in.'
        : 'Click the link in the email to set a new password.';
    return (
      <div className="py-4 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
          <CheckCircle2 className="h-6 w-6 text-emerald-600" strokeWidth={1.5} />
        </div>
        <h2 className="mb-2 font-semibold text-gray-900">{heading}</h2>
        <p className="text-sm text-gray-500">
          We sent a link to <strong>{mode.email}</strong>. {body}
        </p>
        <button
          type="button"
          onClick={() => setMode({ kind: 'form' })}
          className="text-brand-gold-400 hover:text-brand-gold-500 mt-6 text-sm font-medium"
        >
          Use a different email
        </button>
      </div>
    );
  }

  // ---------- form ----------

  const errorMessage =
    error ??
    (initialError === 'auth_failed' ? 'That link is invalid or expired. Try again.' : null);

  return (
    <form onSubmit={handlePasswordSignIn} className="space-y-5">
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
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="focus:ring-brand-teal-200 focus:border-brand-teal-400 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm transition-all outline-none focus:ring-2"
        />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label
            htmlFor="login-password"
            className="text-xs font-semibold tracking-wider text-gray-500 uppercase"
          >
            Password
          </label>
          <button
            type="button"
            onClick={handleForgotPassword}
            disabled={loading === 'reset'}
            className="text-brand-gold-400 hover:text-brand-gold-500 text-xs font-medium disabled:opacity-50"
          >
            {loading === 'reset' ? 'Sending…' : 'Forgot password?'}
          </button>
        </div>
        <div className="relative">
          <input
            id="login-password"
            type={showPassword ? 'text' : 'password'}
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="focus:ring-brand-teal-200 focus:border-brand-teal-400 w-full rounded-xl border border-gray-200 px-4 py-3 pr-11 text-sm transition-all outline-none focus:ring-2"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className="hover:text-brand-teal-500 absolute top-1/2 right-3 -translate-y-1/2 rounded-md p-1 text-gray-400"
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" strokeWidth={1.5} />
            ) : (
              <Eye className="h-4 w-4" strokeWidth={1.5} />
            )}
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {errorMessage}
        </div>
      )}

      <button
        type="submit"
        disabled={loading !== null || !email || !password}
        className="bg-brand-gold-400 hover:bg-brand-gold-500 shadow-soft w-full rounded-xl px-5 py-3 font-medium text-white transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading === 'password' ? 'Signing in…' : 'Sign in'}
      </button>

      <div className="relative flex items-center gap-3">
        <div className="h-px flex-1 bg-gray-200" />
        <span className="text-xs text-gray-400 uppercase tracking-wider">or</span>
        <div className="h-px flex-1 bg-gray-200" />
      </div>

      <button
        type="button"
        onClick={handleMagicLink}
        disabled={loading !== null || !email}
        className="w-full rounded-xl border border-gray-200 px-5 py-3 text-sm font-medium text-gray-700 transition-all hover:border-gray-300 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading === 'magic' ? 'Sending link…' : 'Send magic link instead'}
      </button>
    </form>
  );
}
