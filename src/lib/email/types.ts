/** Template keys that the email system can dispatch from. Maps 1:1 to
 *  the `email_templates.key` column — adding a new trigger means adding
 *  a key here AND seeding a template row in a migration. */
export type EmailTemplateKey =
  | 'decision_awaiting_client'
  | 'photos_categorized'
  | 'invoice_issued'
  | 'appointment_scheduled'
  | 'appointment_reminder'
  | 'welcome_client';

export interface SendEmailInput {
  key: EmailTemplateKey;
  to: string;
  /** Auth user id of the recipient — nullable since we may email
   *  addresses that aren't yet linked to a portal account (e.g. the
   *  welcome email is sent BEFORE the user signs in). */
  recipientUserId?: string | null;
  variables: Record<string, string>;
}

export interface SendEmailResult {
  success: boolean;
  resendId?: string;
  error?: string;
}
