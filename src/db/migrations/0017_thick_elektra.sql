-- Hot-path btree indexes for the admin dashboard / clients-list read paths.
--
-- IF NOT EXISTS on every statement: several of these indexes were added by
-- hand via the Supabase SQL editor in an earlier session and already exist
-- on the live DB. Declaring them in schema.ts makes the schema the source of
-- truth going forward; the guards keep this migration a safe no-op for the
-- indexes that are already present. Genuinely new here: appointments_status,
-- clients_status / assigned_pm / membership_tier, profiles_client_id / role.
CREATE INDEX IF NOT EXISTS "appointments_property_id_idx" ON "appointments" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "appointments_date_idx" ON "appointments" USING btree ("date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "appointments_status_idx" ON "appointments" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "clients_status_idx" ON "clients" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "clients_assigned_pm_id_idx" ON "clients" USING btree ("assigned_pm_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "clients_membership_tier_id_idx" ON "clients" USING btree ("membership_tier_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_client_id_idx" ON "invoices" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_status_idx" ON "invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "profiles_client_id_idx" ON "profiles" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "profiles_role_idx" ON "profiles" USING btree ("role");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "projects_property_id_idx" ON "projects" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "projects_status_idx" ON "projects" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "properties_client_id_idx" ON "properties" USING btree ("client_id");
