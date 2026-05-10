CREATE TABLE "company_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_name" text DEFAULT 'Insight Home Maintenance' NOT NULL,
	"firm_tagline" text,
	"firm_email" text,
	"firm_phone" text,
	"firm_address" text,
	"firm_website" text,
	"business_hours" text,
	"logo_light_url" text,
	"logo_dark_url" text,
	"brand_primary_color" text,
	"brand_accent_color" text,
	"default_invoice_categories" jsonb,
	"email_from_name" text,
	"email_from_address" text,
	"email_reply_to" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Single-row enforcement: prevent more than one row.
CREATE UNIQUE INDEX "company_settings_singleton_idx" ON "company_settings" ((true));
--> statement-breakpoint
-- RLS: admin-only read/write.
ALTER TABLE "company_settings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "Admin full access to company_settings"
ON "company_settings" FOR ALL
TO authenticated
USING (public.current_user_role() = 'admin')
WITH CHECK (public.current_user_role() = 'admin');
--> statement-breakpoint
-- Seed the single row with sensible defaults.
INSERT INTO "company_settings" (
  "firm_name",
  "firm_tagline",
  "firm_email",
  "firm_phone",
  "business_hours",
  "default_invoice_categories"
) VALUES (
  'Insight Home Maintenance',
  'Luxury home maintenance and remodel — SF Bay Area',
  'hello@insighthm.com',
  '(415) 555-0100',
  'Mon–Fri, 8 AM – 5 PM',
  '["Remodel", "Maintenance", "Repair", "Other"]'::jsonb
);
