'use client';

import { CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

// Landing page for:
//   1. Password-recovery emails — user arrives via
//      /auth/callback?next=/auth/reset-password after clicking the link in
//      "Forgot password?" or "Invite user" emails.
//   2. Initial-password setup for newly-invited staff/clients — same
//      path, different entry point.
//
// By the time this page renders the callback has exchanged the code for
// a session cookie, so `supabase.auth.updateUser({ password })` is
// authed automatically.

/** Supabase's default minimum. Configurable in the dashboard — keep this
 *  in sync if you raise it there. */
const MIN_PASSWORD_LENGTH = 8;

export default function ResetPasswordPage() {
  const router = useRouter();
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  // If the user lands here without a session (direct-link without going
  // through the callback) there's nothing we can update — punt to login
  // with a friendly error.
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      setHasSession(Boolean(session));
      setCheckingSession(false);
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }
    setDone(true);
    // Small delay so the user sees the success state before we redirect.
    setTimeout(() => {
      router.replace('/admin');
      router.refresh();
    }, 1200);
  }

  return (
    <div className="bg-brand-warm-100 flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="font-display text-brand-teal-500 mb-2 text-3xl">
            {done ? 'Password updated' : 'Set a new password'}
          </h1>
          <p className="text-sm text-gray-500">
            {done
              ? 'Redirecting you to the dashboard…'
              : 'Choose a password you can remember. This becomes your sign-in credential.'}
          </p>
        </div>

        <div className="shadow-card rounded-2xl bg-white p-8">
          {checkingSession ? (
            <div className="h-48 animate-pulse rounded-xl bg-gray-50" />
          ) : !hasSession ? (
            <NoSessionFallback />
          ) : done ? (
            <div className="py-4 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
                <CheckCircle2 className="h-6 w-6 text-emerald-600" strokeWidth={1.5} />
              </div>
              <p className="text-sm text-gray-500">You&apos;re signed in.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <PasswordField
                id="new-password"
                label="New password"
                autoComplete="new-password"
                value={password}
                onChange={setPassword}
                show={showPassword}
                onToggleShow={() => setShowPassword((v) => !v)}
                hint={`Minimum ${MIN_PASSWORD_LENGTH} characters.`}
              />
              <PasswordField
                id="confirm-password"
                label="Confirm password"
                autoComplete="new-password"
                value={confirm}
                onChange={setConfirm}
                show={showPassword}
                onToggleShow={() => setShowPassword((v) => !v)}
              />

              {error && (
                <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !password || !confirm}
                className="bg-brand-gold-400 hover:bg-brand-gold-500 shadow-soft w-full rounded-xl px-5 py-3 font-medium text-white transition-all disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? 'Updating…' : 'Update password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

interface PasswordFieldProps {
  id: string;
  label: string;
  autoComplete: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggleShow: () => void;
  hint?: string;
}

function PasswordField({
  id,
  label,
  autoComplete,
  value,
  onChange,
  show,
  onToggleShow,
  hint,
}: PasswordFieldProps) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-2 block text-xs font-semibold tracking-wider text-gray-500 uppercase"
      >
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          required
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="••••••••"
          className="focus:ring-brand-teal-200 focus:border-brand-teal-400 w-full rounded-xl border border-gray-200 px-4 py-3 pr-11 text-sm transition-all outline-none focus:ring-2"
        />
        <button
          type="button"
          onClick={onToggleShow}
          aria-label={show ? 'Hide password' : 'Show password'}
          className="hover:text-brand-teal-500 absolute top-1/2 right-3 -translate-y-1/2 rounded-md p-1 text-gray-400"
        >
          {show ? (
            <EyeOff className="h-4 w-4" strokeWidth={1.5} />
          ) : (
            <Eye className="h-4 w-4" strokeWidth={1.5} />
          )}
        </button>
      </div>
      {hint && <p className="mt-1.5 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

function NoSessionFallback() {
  return (
    <div className="py-4 text-center">
      <h2 className="mb-2 font-semibold text-gray-900">Link expired</h2>
      <p className="mb-5 text-sm text-gray-500">
        The reset link is no longer valid. Request a new one from the login page.
      </p>
      <a
        href="/login"
        className="bg-brand-gold-400 hover:bg-brand-gold-500 shadow-soft inline-flex items-center rounded-xl px-5 py-2.5 text-sm font-medium text-white transition-all"
      >
        Back to login
      </a>
    </div>
  );
}
