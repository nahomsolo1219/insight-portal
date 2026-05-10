import 'server-only';

/** Minimal Resend API wrapper. Uses fetch directly — no SDK dependency
 *  needed for a single endpoint. Rate-limit aware: logs warnings but
 *  doesn't retry (the email_log table captures failures for manual
 *  follow-up). */

const RESEND_API_URL = 'https://api.resend.com/emails';

export interface ResendPayload {
  from: string;
  to: string;
  reply_to?: string;
  subject: string;
  text: string;
  html?: string;
}

export interface ResendResult {
  success: boolean;
  id?: string;
  error?: string;
}

export async function sendViaResend(payload: ResendPayload): Promise<ResendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { success: false, error: 'RESEND_API_KEY not configured' };
  }

  try {
    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error('[resend] API error:', response.status, body);
      return { success: false, error: `Resend API ${response.status}: ${body.slice(0, 200)}` };
    }

    const data = await response.json() as { id?: string };
    return { success: true, id: data.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[resend] fetch error:', message);
    return { success: false, error: message };
  }
}
