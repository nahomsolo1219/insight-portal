CREATE TABLE "email_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_key" text,
	"recipient_email" text NOT NULL,
	"recipient_user_id" uuid,
	"subject" text NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"resend_id" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_templates" ADD COLUMN "key" text;--> statement-breakpoint
ALTER TABLE "email_templates" ADD COLUMN "body_html" text;--> statement-breakpoint
ALTER TABLE "email_templates" ADD COLUMN "variables" jsonb;--> statement-breakpoint
ALTER TABLE "email_templates" ADD COLUMN "enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_recipient_user_id_profiles_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "email_templates_key_idx" ON "email_templates" ("key") WHERE "key" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "email_log" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "Admin full access to email_log"
ON "email_log" FOR ALL TO authenticated
USING (public.current_user_role() = 'admin')
WITH CHECK (public.current_user_role() = 'admin');
--> statement-breakpoint
-- Seed trigger-based email templates.
INSERT INTO "email_templates" ("name", "key", "subject", "body", "body_html", "variables", "enabled") VALUES
(
  'Decision awaiting client',
  'decision_awaiting_client',
  '{{firm_name}}: Your input is needed on {{project_name}}',
  E'Hi {{client_name}},\n\n{{firm_name}} needs your decision on "{{decision_title}}" for the {{project_name}} project at {{property_name}}.\n\nView and respond: {{cta_url}}\n\nThanks,\n{{pm_name}}',
  E'<table width="100%" cellpadding="0" cellspacing="0" style="font-family:Inter,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto"><tr><td style="background:#1B4F5A;padding:24px 32px;text-align:center"><img src="{{logo_url}}" alt="{{firm_name}}" height="28" style="height:28px" /></td></tr><tr><td style="padding:32px"><h2 style="margin:0 0 16px;color:#1A1F1E;font-size:20px">A decision needs your input</h2><p style="color:#3C4543;font-size:15px;line-height:1.6;margin:0 0 16px">Hi {{client_name}},</p><p style="color:#3C4543;font-size:15px;line-height:1.6;margin:0 0 24px">We need your decision on <strong>{{decision_title}}</strong> for the {{project_name}} project at {{property_name}}.</p><table cellpadding="0" cellspacing="0"><tr><td style="background:#C8963E;border-radius:8px;padding:12px 24px"><a href="{{cta_url}}" style="color:#fff;text-decoration:none;font-weight:600;font-size:14px">View &amp; respond</a></td></tr></table><p style="color:#6B7370;font-size:13px;margin:24px 0 0">— {{pm_name}}, {{firm_name}}</p></td></tr></table>',
  '["client_name","firm_name","project_name","property_name","decision_title","cta_url","pm_name","logo_url"]'::jsonb,
  true
),
(
  'Photos categorized',
  'photos_categorized',
  '{{firm_name}}: New photos from {{project_name}}',
  E'Hi {{client_name}},\n\n{{photo_count}} new photo(s) from {{project_name}} at {{property_name}} are now available in your portal.\n\nView photos: {{cta_url}}\n\nThanks,\n{{pm_name}}',
  E'<table width="100%" cellpadding="0" cellspacing="0" style="font-family:Inter,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto"><tr><td style="background:#1B4F5A;padding:24px 32px;text-align:center"><img src="{{logo_url}}" alt="{{firm_name}}" height="28" style="height:28px" /></td></tr><tr><td style="padding:32px"><h2 style="margin:0 0 16px;color:#1A1F1E;font-size:20px">New project photos</h2><p style="color:#3C4543;font-size:15px;line-height:1.6;margin:0 0 16px">Hi {{client_name}},</p><p style="color:#3C4543;font-size:15px;line-height:1.6;margin:0 0 24px">{{photo_count}} new photo(s) from <strong>{{project_name}}</strong> at {{property_name}} are now available.</p><table cellpadding="0" cellspacing="0"><tr><td style="background:#C8963E;border-radius:8px;padding:12px 24px"><a href="{{cta_url}}" style="color:#fff;text-decoration:none;font-weight:600;font-size:14px">View photos</a></td></tr></table><p style="color:#6B7370;font-size:13px;margin:24px 0 0">— {{pm_name}}, {{firm_name}}</p></td></tr></table>',
  '["client_name","firm_name","project_name","property_name","photo_count","cta_url","pm_name","logo_url"]'::jsonb,
  true
),
(
  'Invoice issued',
  'invoice_issued',
  '{{firm_name}}: Invoice {{invoice_number}} — {{amount}}',
  E'Hi {{client_name}},\n\nA new invoice has been issued:\n\n• Invoice: {{invoice_number}}\n• Amount: {{amount}}\n• Due: {{due_date}}\n• Description: {{description}}\n\nView invoice: {{cta_url}}\n\nThanks,\n{{pm_name}}',
  E'<table width="100%" cellpadding="0" cellspacing="0" style="font-family:Inter,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto"><tr><td style="background:#1B4F5A;padding:24px 32px;text-align:center"><img src="{{logo_url}}" alt="{{firm_name}}" height="28" style="height:28px" /></td></tr><tr><td style="padding:32px"><h2 style="margin:0 0 16px;color:#1A1F1E;font-size:20px">New invoice</h2><p style="color:#3C4543;font-size:15px;line-height:1.6;margin:0 0 16px">Hi {{client_name}},</p><p style="color:#3C4543;font-size:15px;line-height:1.6;margin:0 0 8px">A new invoice has been issued:</p><table style="margin:0 0 24px;font-size:14px;color:#3C4543"><tr><td style="padding:4px 12px 4px 0;font-weight:600">Invoice</td><td>{{invoice_number}}</td></tr><tr><td style="padding:4px 12px 4px 0;font-weight:600">Amount</td><td>{{amount}}</td></tr><tr><td style="padding:4px 12px 4px 0;font-weight:600">Due</td><td>{{due_date}}</td></tr></table><table cellpadding="0" cellspacing="0"><tr><td style="background:#C8963E;border-radius:8px;padding:12px 24px"><a href="{{cta_url}}" style="color:#fff;text-decoration:none;font-weight:600;font-size:14px">View invoice</a></td></tr></table><p style="color:#6B7370;font-size:13px;margin:24px 0 0">— {{pm_name}}, {{firm_name}}</p></td></tr></table>',
  '["client_name","firm_name","invoice_number","amount","due_date","description","cta_url","pm_name","logo_url"]'::jsonb,
  true
),
(
  'Appointment scheduled',
  'appointment_scheduled',
  '{{firm_name}}: Visit scheduled — {{appointment_title}}',
  E'Hi {{client_name}},\n\nA new visit has been scheduled:\n\n• {{appointment_title}}\n• Date: {{date}}\n• Time: {{time}}\n• Property: {{property_name}}\n\nView appointments: {{cta_url}}\n\nThanks,\n{{pm_name}}',
  E'<table width="100%" cellpadding="0" cellspacing="0" style="font-family:Inter,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto"><tr><td style="background:#1B4F5A;padding:24px 32px;text-align:center"><img src="{{logo_url}}" alt="{{firm_name}}" height="28" style="height:28px" /></td></tr><tr><td style="padding:32px"><h2 style="margin:0 0 16px;color:#1A1F1E;font-size:20px">Visit scheduled</h2><p style="color:#3C4543;font-size:15px;line-height:1.6;margin:0 0 16px">Hi {{client_name}},</p><p style="color:#3C4543;font-size:15px;line-height:1.6;margin:0 0 8px">A new visit has been scheduled:</p><table style="margin:0 0 24px;font-size:14px;color:#3C4543"><tr><td style="padding:4px 12px 4px 0;font-weight:600">Visit</td><td>{{appointment_title}}</td></tr><tr><td style="padding:4px 12px 4px 0;font-weight:600">Date</td><td>{{date}}</td></tr><tr><td style="padding:4px 12px 4px 0;font-weight:600">Time</td><td>{{time}}</td></tr><tr><td style="padding:4px 12px 4px 0;font-weight:600">Property</td><td>{{property_name}}</td></tr></table><table cellpadding="0" cellspacing="0"><tr><td style="background:#C8963E;border-radius:8px;padding:12px 24px"><a href="{{cta_url}}" style="color:#fff;text-decoration:none;font-weight:600;font-size:14px">View appointments</a></td></tr></table><p style="color:#6B7370;font-size:13px;margin:24px 0 0">— {{pm_name}}, {{firm_name}}</p></td></tr></table>',
  '["client_name","firm_name","appointment_title","date","time","property_name","cta_url","pm_name","logo_url"]'::jsonb,
  true
),
(
  'Appointment reminder',
  'appointment_reminder',
  '{{firm_name}}: Reminder — {{appointment_title}} tomorrow',
  E'Hi {{client_name}},\n\nFriendly reminder: you have a visit tomorrow.\n\n• {{appointment_title}}\n• Date: {{date}}\n• Time: {{time}}\n• Property: {{property_name}}\n\nView appointments: {{cta_url}}\n\nThanks,\n{{pm_name}}',
  E'<table width="100%" cellpadding="0" cellspacing="0" style="font-family:Inter,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto"><tr><td style="background:#1B4F5A;padding:24px 32px;text-align:center"><img src="{{logo_url}}" alt="{{firm_name}}" height="28" style="height:28px" /></td></tr><tr><td style="padding:32px"><h2 style="margin:0 0 16px;color:#1A1F1E;font-size:20px">Visit reminder</h2><p style="color:#3C4543;font-size:15px;line-height:1.6;margin:0 0 16px">Hi {{client_name}},</p><p style="color:#3C4543;font-size:15px;line-height:1.6;margin:0 0 8px">Friendly reminder — you have a visit tomorrow:</p><table style="margin:0 0 24px;font-size:14px;color:#3C4543"><tr><td style="padding:4px 12px 4px 0;font-weight:600">Visit</td><td>{{appointment_title}}</td></tr><tr><td style="padding:4px 12px 4px 0;font-weight:600">Date</td><td>{{date}}</td></tr><tr><td style="padding:4px 12px 4px 0;font-weight:600">Time</td><td>{{time}}</td></tr><tr><td style="padding:4px 12px 4px 0;font-weight:600">Property</td><td>{{property_name}}</td></tr></table><table cellpadding="0" cellspacing="0"><tr><td style="background:#C8963E;border-radius:8px;padding:12px 24px"><a href="{{cta_url}}" style="color:#fff;text-decoration:none;font-weight:600;font-size:14px">View appointments</a></td></tr></table><p style="color:#6B7370;font-size:13px;margin:24px 0 0">— {{pm_name}}, {{firm_name}}</p></td></tr></table>',
  '["client_name","firm_name","appointment_title","date","time","property_name","cta_url","pm_name","logo_url"]'::jsonb,
  true
),
(
  'Welcome to the portal',
  'welcome_client',
  'Welcome to {{firm_name}} — your portal is ready',
  E'Hi {{client_name}},\n\nWelcome to {{firm_name}}! Your client portal is now set up.\n\nSign in to view your projects, documents, and upcoming visits: {{cta_url}}\n\nIf you have questions, reach out to {{pm_name}} at {{pm_email}}.\n\nWelcome aboard,\n{{firm_name}}',
  E'<table width="100%" cellpadding="0" cellspacing="0" style="font-family:Inter,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto"><tr><td style="background:#1B4F5A;padding:24px 32px;text-align:center"><img src="{{logo_url}}" alt="{{firm_name}}" height="28" style="height:28px" /></td></tr><tr><td style="padding:32px"><h2 style="margin:0 0 16px;color:#1A1F1E;font-size:20px">Welcome to your portal</h2><p style="color:#3C4543;font-size:15px;line-height:1.6;margin:0 0 16px">Hi {{client_name}},</p><p style="color:#3C4543;font-size:15px;line-height:1.6;margin:0 0 24px">Your client portal is now set up. View your projects, documents, photos, invoices, and upcoming visits — all in one place.</p><table cellpadding="0" cellspacing="0"><tr><td style="background:#C8963E;border-radius:8px;padding:12px 24px"><a href="{{cta_url}}" style="color:#fff;text-decoration:none;font-weight:600;font-size:14px">Sign in to your portal</a></td></tr></table><p style="color:#6B7370;font-size:13px;margin:24px 0 0">Questions? Reach out to {{pm_name}} at {{pm_email}}.<br/>— {{firm_name}}</p></td></tr></table>',
  '["client_name","firm_name","cta_url","pm_name","pm_email","logo_url"]'::jsonb,
  true
);