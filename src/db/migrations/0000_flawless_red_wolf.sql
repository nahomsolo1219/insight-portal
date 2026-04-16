CREATE TYPE "public"."appointment_status" AS ENUM('scheduled', 'confirmed', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('paid', 'unpaid', 'partial');--> statement-breakpoint
CREATE TYPE "public"."milestone_status" AS ENUM('complete', 'in_progress', 'upcoming', 'pending', 'awaiting_client');--> statement-breakpoint
CREATE TYPE "public"."photo_status" AS ENUM('pending', 'categorized', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."photo_tag" AS ENUM('before', 'during', 'after');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('active', 'completed', 'on_hold');--> statement-breakpoint
CREATE TYPE "public"."project_type" AS ENUM('maintenance', 'remodel');--> statement-breakpoint
CREATE TYPE "public"."question_type" AS ENUM('single', 'multi', 'approval', 'open', 'acknowledge');--> statement-breakpoint
CREATE TYPE "public"."staff_role" AS ENUM('founder', 'project_manager', 'field_lead', 'field_tech', 'admin_assistant');--> statement-breakpoint
CREATE TYPE "public"."staff_status" AS ENUM('active', 'pending', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'client', 'field_staff');--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"project_id" uuid,
	"milestone_id" uuid,
	"title" text NOT NULL,
	"vendor_id" uuid,
	"date" date NOT NULL,
	"start_time" time,
	"end_time" time,
	"status" "appointment_status" DEFAULT 'scheduled' NOT NULL,
	"david_on_site" boolean DEFAULT false NOT NULL,
	"scope_of_work" text,
	"assigned_pm_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"actor_name" text,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" uuid,
	"target_label" text,
	"client_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- NOTE: auth.users is owned by Supabase Auth and already exists. We declare it
-- in src/db/schema.ts only so the FK from public.profiles.id can be expressed
-- in Drizzle. The CREATE TABLE block that drizzle-kit emitted here was removed
-- by hand on first generation; do not let future re-generations re-introduce it.
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"membership_tier_id" uuid,
	"assigned_pm_id" uuid,
	"member_since" date,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"date" date NOT NULL,
	"type" text NOT NULL,
	"storage_path" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"last_edited_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"property_id" uuid,
	"project_id" uuid,
	"invoice_number" text NOT NULL,
	"description" text,
	"amount_cents" integer NOT NULL,
	"invoice_date" date NOT NULL,
	"due_date" date NOT NULL,
	"status" "invoice_status" DEFAULT 'unpaid' NOT NULL,
	"storage_path" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "membership_tiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"annual_price_cents" integer NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"category" text,
	"due_date" date,
	"status" "milestone_status" DEFAULT 'pending' NOT NULL,
	"vendor_id" uuid,
	"notes" text,
	"order" integer DEFAULT 0 NOT NULL,
	"question_type" "question_type",
	"question_body" text,
	"options" jsonb,
	"client_response" text,
	"responded_at" timestamp with time zone,
	"responded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid,
	"project_id" uuid,
	"milestone_id" uuid,
	"appointment_id" uuid,
	"uploaded_by_user_id" uuid,
	"uploaded_by_name" text,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"gps_lat" numeric,
	"gps_lng" numeric,
	"tag" "photo_tag",
	"category" text,
	"caption" text,
	"status" "photo_status" DEFAULT 'pending' NOT NULL,
	"storage_path" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"full_name" text,
	"role" "user_role" NOT NULL,
	"phone" text,
	"avatar_url" text,
	"client_id" uuid,
	"staff_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" "project_type" NOT NULL,
	"description" text,
	"duration" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "project_type" NOT NULL,
	"status" "project_status" DEFAULT 'active' NOT NULL,
	"start_date" date,
	"end_date" date,
	"progress" integer DEFAULT 0 NOT NULL,
	"description" text,
	"contract_cents" integer,
	"changes_cents" integer DEFAULT 0 NOT NULL,
	"paid_cents" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"city" text,
	"state" text,
	"zipcode" text,
	"sqft" integer,
	"year_built" integer,
	"gate_code" text,
	"access_notes" text,
	"emergency_contact" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"project_id" uuid,
	"appointment_id" uuid,
	"name" text NOT NULL,
	"date" date NOT NULL,
	"vendor_id" uuid,
	"type" text NOT NULL,
	"storage_path" text NOT NULL,
	"is_new" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"role" "staff_role" NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"status" "staff_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "template_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"title" text NOT NULL,
	"category" text,
	"offset" text,
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"phone" text,
	"email" text,
	"active" boolean DEFAULT true NOT NULL,
	"rating" integer DEFAULT 0 NOT NULL,
	"jobs_completed" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"week_of" date NOT NULL,
	"author_id" uuid,
	"note" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_milestone_id_milestones_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."milestones"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_assigned_pm_id_staff_id_fk" FOREIGN KEY ("assigned_pm_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_membership_tier_id_membership_tiers_id_fk" FOREIGN KEY ("membership_tier_id") REFERENCES "public"."membership_tiers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_assigned_pm_id_staff_id_fk" FOREIGN KEY ("assigned_pm_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_last_edited_by_staff_id_fk" FOREIGN KEY ("last_edited_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_responded_by_profiles_id_fk" FOREIGN KEY ("responded_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_milestone_id_milestones_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."milestones"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_uploaded_by_user_id_profiles_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_milestones" ADD CONSTRAINT "template_milestones_template_id_project_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."project_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_updates" ADD CONSTRAINT "weekly_updates_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_updates" ADD CONSTRAINT "weekly_updates_author_id_staff_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "staff_email_idx" ON "staff" USING btree ("email");--> statement-breakpoint

-- ============================================================================
-- Row Level Security
-- ============================================================================
-- Enable RLS on every table in the public schema. Without policies, a table
-- with RLS enabled denies all access by default.

ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "staff" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "membership_tiers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "clients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "properties" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "vendors" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "project_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "template_milestones" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "projects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "milestones" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "appointments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "photos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "documents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "weekly_updates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "email_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- Helper functions
-- ----------------------------------------------------------------------------
-- SECURITY DEFINER means these run as the function owner (postgres), so they
-- bypass RLS on profiles when looking up the current user's role / client_id.
-- This is what lets the policies below avoid recursive RLS evaluation.

CREATE OR REPLACE FUNCTION public.current_user_role() RETURNS user_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.current_user_client_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT client_id FROM public.profiles WHERE id = auth.uid()
$$;--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- Admin bypass — admins can do anything on every table.
-- ----------------------------------------------------------------------------

CREATE POLICY "Admin full access" ON "profiles" FOR ALL TO authenticated USING (current_user_role() = 'admin');--> statement-breakpoint
CREATE POLICY "Admin full access" ON "staff" FOR ALL TO authenticated USING (current_user_role() = 'admin');--> statement-breakpoint
CREATE POLICY "Admin full access" ON "membership_tiers" FOR ALL TO authenticated USING (current_user_role() = 'admin');--> statement-breakpoint
CREATE POLICY "Admin full access" ON "clients" FOR ALL TO authenticated USING (current_user_role() = 'admin');--> statement-breakpoint
CREATE POLICY "Admin full access" ON "properties" FOR ALL TO authenticated USING (current_user_role() = 'admin');--> statement-breakpoint
CREATE POLICY "Admin full access" ON "vendors" FOR ALL TO authenticated USING (current_user_role() = 'admin');--> statement-breakpoint
CREATE POLICY "Admin full access" ON "project_templates" FOR ALL TO authenticated USING (current_user_role() = 'admin');--> statement-breakpoint
CREATE POLICY "Admin full access" ON "template_milestones" FOR ALL TO authenticated USING (current_user_role() = 'admin');--> statement-breakpoint
CREATE POLICY "Admin full access" ON "projects" FOR ALL TO authenticated USING (current_user_role() = 'admin');--> statement-breakpoint
CREATE POLICY "Admin full access" ON "milestones" FOR ALL TO authenticated USING (current_user_role() = 'admin');--> statement-breakpoint
CREATE POLICY "Admin full access" ON "appointments" FOR ALL TO authenticated USING (current_user_role() = 'admin');--> statement-breakpoint
CREATE POLICY "Admin full access" ON "photos" FOR ALL TO authenticated USING (current_user_role() = 'admin');--> statement-breakpoint
CREATE POLICY "Admin full access" ON "reports" FOR ALL TO authenticated USING (current_user_role() = 'admin');--> statement-breakpoint
CREATE POLICY "Admin full access" ON "documents" FOR ALL TO authenticated USING (current_user_role() = 'admin');--> statement-breakpoint
CREATE POLICY "Admin full access" ON "invoices" FOR ALL TO authenticated USING (current_user_role() = 'admin');--> statement-breakpoint
CREATE POLICY "Admin full access" ON "weekly_updates" FOR ALL TO authenticated USING (current_user_role() = 'admin');--> statement-breakpoint
CREATE POLICY "Admin full access" ON "audit_log" FOR ALL TO authenticated USING (current_user_role() = 'admin');--> statement-breakpoint
CREATE POLICY "Admin full access" ON "email_templates" FOR ALL TO authenticated USING (current_user_role() = 'admin');--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- Client read policies — clients see only their own household's data.
-- ----------------------------------------------------------------------------

CREATE POLICY "Clients view own profile" ON "profiles" FOR SELECT TO authenticated
  USING (current_user_role() = 'client' AND id = auth.uid());--> statement-breakpoint

CREATE POLICY "Clients view own record" ON "clients" FOR SELECT TO authenticated
  USING (current_user_role() = 'client' AND id = current_user_client_id());--> statement-breakpoint

CREATE POLICY "Clients view own properties" ON "properties" FOR SELECT TO authenticated
  USING (current_user_role() = 'client' AND client_id = current_user_client_id());--> statement-breakpoint

CREATE POLICY "Clients view own projects" ON "projects" FOR SELECT TO authenticated
  USING (current_user_role() = 'client' AND property_id IN (
    SELECT id FROM properties WHERE client_id = current_user_client_id()
  ));--> statement-breakpoint

CREATE POLICY "Clients view own milestones" ON "milestones" FOR SELECT TO authenticated
  USING (current_user_role() = 'client' AND project_id IN (
    SELECT p.id FROM projects p JOIN properties pr ON p.property_id = pr.id
    WHERE pr.client_id = current_user_client_id()
  ));--> statement-breakpoint

CREATE POLICY "Clients respond to own milestones" ON "milestones" FOR UPDATE TO authenticated
  USING (current_user_role() = 'client' AND project_id IN (
    SELECT p.id FROM projects p JOIN properties pr ON p.property_id = pr.id
    WHERE pr.client_id = current_user_client_id()
  ))
  WITH CHECK (current_user_role() = 'client');--> statement-breakpoint

CREATE POLICY "Clients view own appointments" ON "appointments" FOR SELECT TO authenticated
  USING (current_user_role() = 'client' AND property_id IN (
    SELECT id FROM properties WHERE client_id = current_user_client_id()
  ));--> statement-breakpoint

CREATE POLICY "Clients view own photos" ON "photos" FOR SELECT TO authenticated
  USING (current_user_role() = 'client' AND status = 'categorized' AND property_id IN (
    SELECT id FROM properties WHERE client_id = current_user_client_id()
  ));--> statement-breakpoint

CREATE POLICY "Clients view own reports" ON "reports" FOR SELECT TO authenticated
  USING (current_user_role() = 'client' AND property_id IN (
    SELECT id FROM properties WHERE client_id = current_user_client_id()
  ));--> statement-breakpoint

CREATE POLICY "Clients view own documents" ON "documents" FOR SELECT TO authenticated
  USING (current_user_role() = 'client' AND project_id IN (
    SELECT p.id FROM projects p JOIN properties pr ON p.property_id = pr.id
    WHERE pr.client_id = current_user_client_id()
  ));--> statement-breakpoint

CREATE POLICY "Clients view own invoices" ON "invoices" FOR SELECT TO authenticated
  USING (current_user_role() = 'client' AND client_id = current_user_client_id());--> statement-breakpoint

CREATE POLICY "Clients view own weekly updates" ON "weekly_updates" FOR SELECT TO authenticated
  USING (current_user_role() = 'client' AND project_id IN (
    SELECT p.id FROM projects p JOIN properties pr ON p.property_id = pr.id
    WHERE pr.client_id = current_user_client_id()
  ));--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- Field staff policies — see own profile, insert + view own photos.
-- ----------------------------------------------------------------------------

CREATE POLICY "Field staff view own profile" ON "profiles" FOR SELECT TO authenticated
  USING (current_user_role() = 'field_staff' AND id = auth.uid());--> statement-breakpoint

CREATE POLICY "Field staff insert photos" ON "photos" FOR INSERT TO authenticated
  WITH CHECK (current_user_role() = 'field_staff' AND uploaded_by_user_id = auth.uid());--> statement-breakpoint

CREATE POLICY "Field staff view own photo uploads" ON "photos" FOR SELECT TO authenticated
  USING (current_user_role() = 'field_staff' AND uploaded_by_user_id = auth.uid());--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- Reference-table reads — every authenticated user can read tier names; admin
-- and field staff (but not clients) can read the vendors and staff directories.
-- ----------------------------------------------------------------------------

CREATE POLICY "Authenticated read membership_tiers" ON "membership_tiers" FOR SELECT TO authenticated USING (true);--> statement-breakpoint
CREATE POLICY "Authenticated read vendors" ON "vendors" FOR SELECT TO authenticated USING (current_user_role() != 'client');--> statement-breakpoint
CREATE POLICY "Authenticated read staff" ON "staff" FOR SELECT TO authenticated USING (current_user_role() != 'client');