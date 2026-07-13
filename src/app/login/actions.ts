'use server';

import { sendEmail } from '@/lib/email/send';
import { createAdminClient } from '@/lib/supabase/admin';

// Public login-page auth-email actions. These take over the recovery and
// magic-link emails from Supabase: `generateLink` returns the link without
// sending anything, and we send our own branded email via Resend.
//
// These are UNAUTHENTICATED (the login page is public), and they use the
// service-role client only to generate a link and email it to the address
// itself — nothing sensitive is returned to the caller, so this is not an
// enumeration or exfiltration vector. We deliberately always resolve to a
// generic `{ ok: true }` (even when the email isn't a real user, which makes
// generateLink error) so a caller can't probe which addresses have accounts.
// Every attempt — success or failure — is recorded in email_log by sendEmail,
// so a genuinely failed send is still discoverable by an admin.

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
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

    if (error || !data?.properties?.action_link) {
      // Expected when the email isn't a registered user — don't reveal that.
      console.warn('[requestPasswordReset] no link generated:', error?.message);
      return { ok: true };
    }

    await sendEmail({
      key: 'password_reset',
      to,
      recipientUserId: data.user?.id ?? null,
      variables: { cta_url: data.properties.action_link },
    });
  } catch (err) {
    console.error('[requestPasswordReset] unexpected error:', err);
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

    if (error || !data?.properties?.action_link) {
      // Users are invite-only, so a magic-link request for a non-user errors
      // here. Stay generic to avoid leaking which addresses have accounts.
      console.warn('[requestMagicLink] no link generated:', error?.message);
      return { ok: true };
    }

    await sendEmail({
      key: 'magic_link',
      to,
      recipientUserId: data.user?.id ?? null,
      variables: { cta_url: data.properties.action_link },
    });
  } catch (err) {
    console.error('[requestMagicLink] unexpected error:', err);
  }

  return { ok: true };
}
