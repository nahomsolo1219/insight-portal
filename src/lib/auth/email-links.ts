import 'server-only';

import type { EmailOtpType } from '@supabase/supabase-js';

/**
 * Build the email CTA URL for an admin-generated auth link (invite / recovery /
 * magic link).
 *
 * We deliberately DO NOT use generateLink's `action_link`. That link is the
 * hosted `auth/v1/verify?token=…&type=…&redirect_to=…` GET endpoint; when
 * clicked it completes in the IMPLICIT flow and hands the session back to
 * `redirect_to` in the URL FRAGMENT (`#access_token=…`). A fragment never
 * reaches the server, so our `/auth/callback` route can't read it — the link
 * appeared "invalid or expired" for every click.
 *
 * Instead we point the email straight at our own callback carrying the
 * `token_hash` + `type`, and the callback verifies with
 * `supabase.auth.verifyOtp({ token_hash, type })` (the Supabase server-side
 * pattern that sets the session via cookies). `next` is where the callback
 * sends the user after a successful verify.
 */
export function buildAuthConfirmUrl(params: {
  siteUrl: string;
  tokenHash: string;
  type: EmailOtpType | string;
  next: string;
}): string {
  const url = new URL('/auth/callback', params.siteUrl);
  url.searchParams.set('token_hash', params.tokenHash);
  url.searchParams.set('type', String(params.type));
  url.searchParams.set('next', params.next);
  return url.toString();
}
