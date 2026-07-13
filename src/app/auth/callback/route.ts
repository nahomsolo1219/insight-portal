// Auth email redirect target. Handles the links our branded emails send
// (invite / recovery / magic link), which are generated via
// `auth.admin.generateLink` and point here with `?token_hash=…&type=…&next=…`.
// We verify with `verifyOtp` (sets the session cookie server-side), then route.
//
// Two verification paths are supported:
//   1. token_hash + type — the SSR flow our generateLink emails use (primary).
//   2. ?code= — the PKCE exchange, kept for any browser-initiated flow
//      (e.g. a future OAuth provider). The old admin invite emails relied on
//      this, but admin-generated links don't produce a `code`, which is why
//      every link failed until we switched to token_hash below.
//
// Routing after verify:
//   - `?next=` wins (invite/recovery send the user to /auth/reset-password).
//   - Otherwise `/`, which dispatches per role (admin → /admin, client → /portal).

import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const EMAIL_OTP_TYPES = new Set<string>([
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
  'email',
]);

function isEmailOtpType(value: string | null): value is EmailOtpType {
  return value !== null && EMAIL_OTP_TYPES.has(value);
}

/** One-liner with the Supabase error code + status + message, for the logs. */
function describeAuthError(error: { code?: string; status?: number; message?: string } | null): string {
  if (!error) return 'no error';
  return `code=${error.code ?? 'n/a'} status=${error.status ?? 'n/a'}: ${error.message ?? ''}`;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const rawNext = searchParams.get('next') ?? '/';
  // Only allow internal relative destinations (no open redirect).
  const next = rawNext.startsWith('/') ? rawNext : '/';
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type');
  const code = searchParams.get('code');

  const supabase = await createClient();

  // Primary: token_hash + type from an admin generateLink email.
  if (tokenHash && isEmailOtpType(type)) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error(`[auth/callback] verifyOtp failed (type=${type}):`, describeAuthError(error));
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  // Legacy / browser-initiated PKCE flow: exchange the ?code= for a session.
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error('[auth/callback] exchangeCodeForSession failed:', describeAuthError(error));
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  // Neither present. Usually means the link delivered the session in the URL
  // fragment (#access_token=…) — which never reaches the server — or the link
  // was malformed. Log enough to tell the two apart without leaking the token.
  console.error('[auth/callback] no verifiable params on callback', {
    hasTokenHash: Boolean(tokenHash),
    type,
    hasCode: Boolean(code),
  });
  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
