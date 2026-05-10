CREATE TYPE "public"."appointment_kind" AS ENUM('project', 'maintenance');--> statement-breakpoint
CREATE TABLE "maintenance_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"name" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"billing_total_cents" integer,
	"billing_cadence" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"notes" text,
	"home_assessment_url" text,
	"playbook_url" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maintenance_visit_scope_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visit_id" uuid NOT NULL,
	"scope_type" text NOT NULL,
	"custom_label" text,
	"vendor_id" uuid,
	"completed" boolean DEFAULT false NOT NULL,
	"completion_notes" text,
	"item_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maintenance_visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"title" text NOT NULL,
	"scheduled_date" date NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"visit_order" integer DEFAULT 0 NOT NULL,
	"is_ad_hoc" boolean DEFAULT false NOT NULL,
	"vendor_id" uuid,
	"assigned_field_staff_id" uuid,
	"appointment_id" uuid,
	"notes" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "kind" "appointment_kind" DEFAULT 'project' NOT NULL;--> statement-breakpoint
ALTER TABLE "maintenance_plans" ADD CONSTRAINT "maintenance_plans_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_plans" ADD CONSTRAINT "maintenance_plans_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_visit_scope_items" ADD CONSTRAINT "maintenance_visit_scope_items_visit_id_maintenance_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."maintenance_visits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_visit_scope_items" ADD CONSTRAINT "maintenance_visit_scope_items_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_visits" ADD CONSTRAINT "maintenance_visits_plan_id_maintenance_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."maintenance_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_visits" ADD CONSTRAINT "maintenance_visits_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_visits" ADD CONSTRAINT "maintenance_visits_assigned_field_staff_id_profiles_id_fk" FOREIGN KEY ("assigned_field_staff_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_visits" ADD CONSTRAINT "maintenance_visits_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "maintenance_plans_property_idx" ON "maintenance_plans" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "maintenance_plans_status_idx" ON "maintenance_plans" USING btree ("status");--> statement-breakpoint
CREATE INDEX "maintenance_plans_property_status_idx" ON "maintenance_plans" USING btree ("property_id","status");--> statement-breakpoint
CREATE INDEX "maintenance_visit_scope_items_visit_idx" ON "maintenance_visit_scope_items" USING btree ("visit_id");--> statement-breakpoint
CREATE INDEX "maintenance_visit_scope_items_visit_order_idx" ON "maintenance_visit_scope_items" USING btree ("visit_id","item_order");--> statement-breakpoint
CREATE INDEX "maintenance_visits_plan_idx" ON "maintenance_visits" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "maintenance_visits_scheduled_date_idx" ON "maintenance_visits" USING btree ("scheduled_date");--> statement-breakpoint
CREATE INDEX "maintenance_visits_plan_order_idx" ON "maintenance_visits" USING btree ("plan_id","visit_order");--> statement-breakpoint
CREATE INDEX "maintenance_visits_status_idx" ON "maintenance_visits" USING btree ("status");--> statement-breakpoint
-- ----------------------------------------------------------------------------
-- RLS for maintenance_plans, maintenance_visits, maintenance_visit_scope_items.
-- Mirrors the shape used for projects: admins full access; clients read
-- their own household's data; field staff read visits assigned to them
-- and update only the completed/notes fields on scope items.
-- RLS appended by hand: drizzle-kit doesn't emit ENABLE / CREATE POLICY,
-- and the base migration (0000) follows the same pattern.
-- ----------------------------------------------------------------------------
ALTER TABLE "maintenance_plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "maintenance_visits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "maintenance_visit_scope_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- Admin full access ----------------------------------------------------------
CREATE POLICY "Admin full access" ON "maintenance_plans" FOR ALL TO authenticated USING (current_user_role() = 'admin');--> statement-breakpoint
CREATE POLICY "Admin full access" ON "maintenance_visits" FOR ALL TO authenticated USING (current_user_role() = 'admin');--> statement-breakpoint
CREATE POLICY "Admin full access" ON "maintenance_visit_scope_items" FOR ALL TO authenticated USING (current_user_role() = 'admin');--> statement-breakpoint

-- Client reads — scoped through property → client_id (same shape as projects)
CREATE POLICY "Clients view own maintenance plans" ON "maintenance_plans" FOR SELECT TO authenticated
  USING (current_user_role() = 'client' AND property_id IN (
    SELECT id FROM properties WHERE client_id = current_user_client_id()
  ));--> statement-breakpoint

CREATE POLICY "Clients view own maintenance visits" ON "maintenance_visits" FOR SELECT TO authenticated
  USING (current_user_role() = 'client' AND plan_id IN (
    SELECT mp.id FROM maintenance_plans mp
    JOIN properties pr ON pr.id = mp.property_id
    WHERE pr.client_id = current_user_client_id()
  ));--> statement-breakpoint

CREATE POLICY "Clients view own maintenance scope items" ON "maintenance_visit_scope_items" FOR SELECT TO authenticated
  USING (current_user_role() = 'client' AND visit_id IN (
    SELECT mv.id FROM maintenance_visits mv
    JOIN maintenance_plans mp ON mp.id = mv.plan_id
    JOIN properties pr ON pr.id = mp.property_id
    WHERE pr.client_id = current_user_client_id()
  ));--> statement-breakpoint

-- Field staff — read visits assigned to them, plus the parent plan and child
-- scope items so the visit page can render context. Update is permitted on
-- scope items so the technician can tick "completed" + add completion notes.
CREATE POLICY "Field staff view assigned visits" ON "maintenance_visits" FOR SELECT TO authenticated
  USING (current_user_role() = 'field_staff' AND assigned_field_staff_id = auth.uid());--> statement-breakpoint

CREATE POLICY "Field staff view plans of assigned visits" ON "maintenance_plans" FOR SELECT TO authenticated
  USING (current_user_role() = 'field_staff' AND id IN (
    SELECT plan_id FROM maintenance_visits WHERE assigned_field_staff_id = auth.uid()
  ));--> statement-breakpoint

CREATE POLICY "Field staff view scope items of assigned visits" ON "maintenance_visit_scope_items" FOR SELECT TO authenticated
  USING (current_user_role() = 'field_staff' AND visit_id IN (
    SELECT id FROM maintenance_visits WHERE assigned_field_staff_id = auth.uid()
  ));--> statement-breakpoint

CREATE POLICY "Field staff complete scope items on assigned visits" ON "maintenance_visit_scope_items" FOR UPDATE TO authenticated
  USING (current_user_role() = 'field_staff' AND visit_id IN (
    SELECT id FROM maintenance_visits WHERE assigned_field_staff_id = auth.uid()
  ))
  WITH CHECK (current_user_role() = 'field_staff' AND visit_id IN (
    SELECT id FROM maintenance_visits WHERE assigned_field_staff_id = auth.uid()
  ));