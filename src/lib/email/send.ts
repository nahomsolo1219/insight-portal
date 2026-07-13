import 'server-only';

import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { emailLog, emailTemplates } from '@/db/schema';
import { getCompanySettings } from '@/lib/company/queries';
import { renderTemplate } from './render';
import { sendViaResend } from './resend';
import type { SendEmailInput, SendEmailResult } from './types';

/**
 * High-level email dispatch. Looks up the template by key, renders
 * variables, sends via Resend, and logs the result to email_log.
 *
 * This function never throws — a failed email must never block the
 * calling action. Errors are captured in email_log and console.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  try {
    // 1. Look up template.
    const [template] = await db
      .select({
        subject: emailTemplates.subject,
        body: emailTemplates.body,
        bodyHtml: emailTemplates.bodyHtml,
        enabled: emailTemplates.enabled,
      })
      .from(emailTemplates)
      .where(eq(emailTemplates.key, input.key))
      .limit(1);

    if (!template) {
      const error = `Template not found: ${input.key}`;
      console.error('[email.send]', error);
      await logEmail(input, '', 'failed', error);
      return { success: false, error };
    }

    // 2. Check if disabled.
    if (!template.enabled) {
      await logEmail(input, template.subject, 'skipped_disabled');
      return { success: true };
    }

    // 3. Resolve company settings for from address + firm variables.
    const company = await getCompanySettings();
    const fromName = company.emailFromName || company.firmName;
    const fromAddress = company.emailFromAddress || 'noreply@insighthm.com';
    const replyTo = company.emailReplyTo || undefined;

    // Inject firm-level variables.
    //
    // The email logo must be an ABSOLUTE, publicly-fetchable, RASTER URL:
    // an inbox renders with no session, and Gmail/Outlook don't display
    // SVG. `company.logoLightUrl` is a private-bucket STORAGE PATH (e.g.
    // "company/logo-light.png") — dropping it into <img src> yields a
    // broken relative link behind auth, which is the "broken logo in Gmail"
    // bug. So we ignore it unless it's already an absolute http(s) URL, and
    // otherwise use the bundled PNG served publicly by Next from /public.
    // (The old fallback pointed at /logo-dark.svg — absolute but SVG, so
    // still broken in Gmail.)
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const logoUrl = isAbsoluteUrl(company.logoLightUrl)
      ? company.logoLightUrl
      : `${siteUrl}/logo-email.png`;
    const vars: Record<string, string> = {
      firm_name: company.firmName,
      logo_url: logoUrl,
      ...input.variables,
    };

    // 4. Render.
    const subject = renderTemplate(template.subject, vars);
    const text = renderTemplate(template.body, vars);
    const html = template.bodyHtml ? renderTemplate(template.bodyHtml, vars) : undefined;

    // 5. Send.
    const result = await sendViaResend({
      from: `${fromName} <${fromAddress}>`,
      to: input.to,
      reply_to: replyTo,
      subject,
      text,
      html,
    });

    // 6. Log.
    await logEmail(
      input,
      subject,
      result.success ? 'sent' : 'failed',
      result.error,
      result.id,
    );

    return result.success
      ? { success: true, resendId: result.id }
      : { success: false, error: result.error };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[email.send] unexpected error:', message);
    await logEmail(input, '', 'failed', message).catch(() => {});
    return { success: false, error: message };
  }
}

/** True when the stored value is already an absolute http(s) URL an inbox
 *  can fetch. Firm logos are normally private-bucket storage paths, which
 *  fail in email — those fall through to the bundled public asset. */
function isAbsoluteUrl(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^https?:\/\//i.test(value);
}

async function logEmail(
  input: SendEmailInput,
  subject: string,
  status: string,
  error?: string,
  resendId?: string,
) {
  try {
    await db.insert(emailLog).values({
      templateKey: input.key,
      recipientEmail: input.to,
      recipientUserId: input.recipientUserId ?? null,
      subject,
      status,
      error: error ?? null,
      resendId: resendId ?? null,
    });
  } catch (logError) {
    console.error('[email.send] failed to write email_log:', logError);
  }
}
