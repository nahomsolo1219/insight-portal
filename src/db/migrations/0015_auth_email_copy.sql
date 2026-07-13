-- Data-only migration (no schema change). We now generate the auth link
-- ourselves (auth.admin.generateLink) and send it through Resend, so the
-- welcome_client email carries the REAL password-set link as {{cta_url}}.
-- The old copy said "Sign in to your portal" — wrong for a first-time invited
-- user who has no password yet. Rewrite subject + body + button to say what
-- actually happens: set your password / activate your account.

UPDATE "email_templates"
SET
  "subject" = 'Activate your {{firm_name}} portal account',
  "body" = E'Hi {{client_name}},\n\nWelcome to {{firm_name}}! Your portal account has been created.\n\nSet your password to activate your account, then view your projects, documents, photos, invoices, and upcoming visits — all in one place:\n{{cta_url}}\n\nThis one link sets your password and signs you in. If you have questions, reach out to {{pm_name}} at {{pm_email}}.\n\nWelcome aboard,\n{{firm_name}}',
  "body_html" = E'<table width="100%" cellpadding="0" cellspacing="0" style="font-family:Inter,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto"><tr><td style="background:#1B4F5A;padding:24px 32px;text-align:center"><img src="{{logo_url}}" alt="{{firm_name}}" height="28" style="height:28px" /></td></tr><tr><td style="padding:32px"><h2 style="margin:0 0 16px;color:#1A1F1E;font-size:20px">Activate your portal account</h2><p style="color:#3C4543;font-size:15px;line-height:1.6;margin:0 0 16px">Hi {{client_name}},</p><p style="color:#3C4543;font-size:15px;line-height:1.6;margin:0 0 24px">Welcome to {{firm_name}}. Set your password to activate your account — then you can view your projects, documents, photos, invoices, and upcoming visits, all in one place.</p><table cellpadding="0" cellspacing="0"><tr><td style="background:#C8963E;border-radius:8px;padding:12px 24px"><a href="{{cta_url}}" style="color:#fff;text-decoration:none;font-weight:600;font-size:14px">Set your password</a></td></tr></table><p style="color:#6B7370;font-size:13px;margin:24px 0 0">This link sets your password and signs you in. Questions? Reach out to {{pm_name}} at {{pm_email}}.<br/>— {{firm_name}}</p></td></tr></table>'
WHERE "key" = 'welcome_client';
