'use server';

import { db } from '@/db';
import { emailLog } from '@/db/schema';
import { buildAuthConfirmUrl } from '@/lib/auth/email-links';
import { sendEmail } from '@/lib/email/send';
import type { EmailTemplateKey } from '@/lib/email/types';
import { createAdminClient } from '@/lib/supabase/admin';

// Public login-page auth-email actions. These take over the recovery and
// magic-link emails from Supabase: `generateLink` returns the link without
// sending anything, and we send our own branded email via Resend.
//
// These are UNAUTHENTICATED (the login page is public), and they use the
// service-role client only to generate a link and email it to the address
// itself — nothing sensitive is returned to the caller, so this is not an
// enumeration or exfiltration vector.
//
// ANTI-ENUMERATION lives in the RESPONSE ONLY: we always resolve to a generic
// `{ ok: true }` so a caller can't tell whether an account exists. But every
// failure MUST be observable server-side — otherwise a broken reset (e.g.
// generateLink rejecting the redirect, a missing service-role key, or a
// non-existent user) fails silently with nothing to debug. So every failure
// path here: (a) console.error's the full error, and (b) writes a
// status='failed' row to email_log, even when we bail BEFORE calling
// sendEmail. Never `return { ok: true }` on a failure without logging first.

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
}

/** Human-readable one-liner from a Supabase AuthError (or anything). Captures
 *  the code + status the dashboard/logs need, not just the message. */
function describeError(error: unknown): string {
  if (error && typeof error === 'object') {
    const e = error as { name?: string; code?: string; status?: number; message?: string };
    return `${e.name ?? 'Error'} code=${e.code ?? 'n/a'} status=${e.status ?? 'n/a'}: ${
      e.message ?? JSON.stringify(error)
    }`;
  }
  return String(error);
}

/** Record a failed auth-email attempt in email_log so it's discoverable even
 *  when we never reached sendEmail(). Never throws. */
async function logFailedAttempt(key: EmailTemplateKey, to: string, detail: string): Promise<void> {
  try {
    await db.insert(emailLog).values({
      templateKey: key,
      recipientEmail: to,
      recipientUserId: null, // no user id available on a generateLink failure
      subject: '(auth link generation failed — no email sent)',
      status: 'failed',
      error: detail,
    });
  } catch (logErr) {
    console.error('[login.actions] failed to write email_log row:', logErr);
  }
}

export async function requestPasswordReset(email: string): Promise<{ ok: boolean }> {
  const to = email.trim().toLowerCase();
  if (!to) return { ok: false };

  try {
    const admin = createAdminClient();
    const redirectTo = `${siteUrl()}/auth/callback?next=/auth/reset-password`;
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email: to,
      options: { redirectTo },
    });

    if (error || !data?.properties?.hashed_token) {
      // Observable failure: full error + a failed email_log row. Stay generic
      // in the RESPONSE (return ok below) so we don't leak account existence.
      console.error('[requestPasswordReset] generateLink failed', {
        email: to,
        redirectTo,
        siteUrlEnvSet: Boolean(process.env.NEXT_PUBLIC_SITE_URL),
        serviceRoleKeySet: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
        error,
      });
      await logFailedAttempt(
        'password_reset',
        to,
        error ? describeError(error) : 'generateLink returned no token_hash and no error',
      );
      return { ok: true };
    }

    // Point the email at our own callback with token_hash + type (not the
    // hosted action_link — it can't be verified server-side).
    const props = data.properties;
    const ctaUrl = buildAuthConfirmUrl({
      siteUrl: siteUrl(),
      tokenHash: props.hashed_token,
      type: props.verification_type,
      next: '/auth/reset-password',
    });

    await sendEmail({
      key: 'password_reset',
      to,
      recipientUserId: data.user?.id ?? null,
      variables: { cta_url: ctaUrl },
    });
  } catch (err) {
    console.error('[requestPasswordReset] unexpected error:', err);
    await logFailedAttempt('password_reset', to, `unexpected: ${describeError(err)}`);
  }

  return { ok: true };
}

export async function requestMagicLink(
  email: string,
  next = '/',
): Promise<{ ok: boolean }> {
  const to = email.trim().toLowerCase();
  if (!to) return { ok: false };

  try {
    const admin = createAdminClient();
    // Only allow internal relative destinations through `next`.
    const safeNext = next.startsWith('/') ? next : '/';
    const redirectTo = `${siteUrl()}/auth/callback?next=${encodeURIComponent(safeNext)}`;
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: to,
      options: { redirectTo },
    });

    if (error || !data?.properties?.hashed_token) {
      console.error('[requestMagicLink] generateLink failed', {
        email: to,
        redirectTo,
        siteUrlEnvSet: Boolean(process.env.NEXT_PUBLIC_SITE_URL),
        serviceRoleKeySet: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
        error,
      });
      await logFailedAttempt(
        'magic_link',
        to,
        error ? describeError(error) : 'generateLink returned no token_hash and no error',
      );
      return { ok: true };
    }

    const props = data.properties;
    const ctaUrl = buildAuthConfirmUrl({
      siteUrl: siteUrl(),
      tokenHash: props.hashed_token,
      type: props.verification_type,
      next: safeNext,
    });

    await sendEmail({
      key: 'magic_link',
      to,
      recipientUserId: data.user?.id ?? null,
      variables: { cta_url: ctaUrl },
    });
  } catch (err) {
    console.error('[requestMagicLink] unexpected error:', err);
    await logFailedAttempt('magic_link', to, `unexpected: ${describeError(err)}`);
  }

  return { ok: true };
}
