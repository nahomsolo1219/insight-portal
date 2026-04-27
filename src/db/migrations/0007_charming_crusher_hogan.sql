-- ============================================================================
-- 0007 — Field staff project assignments + role consolidation
-- ============================================================================
-- This migration does three things atomically:
--   1. Collapse `field_lead` and `field_tech` into a single `field_staff`
--      value on the `staff_role` enum (the auth `user_role` enum already
--      only had `field_staff`; the HR enum was the last place the
--      distinction lived).
--   2. Create the `project_assignments` table — a many-to-many between
--      projects and profiles. Drives what each technician can see.
--   3. Add RLS policies that scope projects / properties / clients to
--      assigned-only for `field_staff` users, and tighten the photo
--      INSERT policy so a tech can't post against an unassigned project.
--
-- Reversibility note:
--   The enum collapse is *partially* reversible. We can re-add
--   `field_lead` / `field_tech` to the type, but any row that was
--   UPDATEd from one of those values to `field_staff` is now
--   indistinguishable from a row that was always `field_staff`. The
--   data is lost. A "down" migration could restore the enum shape but
--   not the original assignments. This is documented as acceptable —
--   the values were dead and the existing seed only had a single
--   `field_lead` row.
-- ============================================================================

-- ---------- Role consolidation -------------------------------------------

-- Drop the staff_role values by:
--   a) casting the column to text so the enum constraint goes away,
--   b) UPDATEing the offending values to the new canonical name,
--   c) dropping + recreating the enum without the old values,
--   d) casting back to the new enum (now safe — no stale values remain).
ALTER TABLE "staff" ALTER COLUMN "role" SET DATA TYPE text;--> statement-breakpoint
UPDATE "staff" SET "role" = 'field_staff' WHERE "role" IN ('field_lead', 'field_tech');--> statement-breakpoint
DROP TYPE "public"."staff_role";--> statement-breakpoint
CREATE TYPE "public"."staff_role" AS ENUM('founder', 'project_manager', 'field_staff', 'admin_assistant');--> statement-breakpoint
ALTER TABLE "staff" ALTER COLUMN "role" SET DATA TYPE "public"."staff_role" USING "role"::"public"."staff_role";--> statement-breakpoint

-- ---------- project_assignments table ------------------------------------

CREATE TABLE "project_assignments" (
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_assignments_project_id_user_id_pk" PRIMARY KEY("project_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "project_assignments" ADD CONSTRAINT "project_assignments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_assignments" ADD CONSTRAINT "project_assignments_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_assignments_user_id_idx" ON "project_assignments" USING btree ("user_id");--> statement-breakpoint

-- ---------- RLS on project_assignments -----------------------------------

ALTER TABLE "project_assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "Admin full access" ON "project_assignments" FOR ALL TO authenticated
  USING (current_user_role() = 'admin');--> statement-breakpoint
-- Field staff can read only the rows that belong to them — useful for
-- self-checks ("am I assigned to anything?") without going through the
-- SECURITY DEFINER profile lookup.
CREATE POLICY "Field staff view own assignments" ON "project_assignments" FOR SELECT TO authenticated
  USING (current_user_role() = 'field_staff' AND user_id = auth.uid());--> statement-breakpoint

-- ---------- Field staff scoping on projects / properties / clients -------

-- Field staff see a project only if there's an assignment row for them
-- on that project. Status-agnostic: completed projects still show.
CREATE POLICY "Field staff view assigned projects" ON "projects" FOR SELECT TO authenticated
  USING (
    current_user_role() = 'field_staff'
    AND EXISTS (
      SELECT 1 FROM public.project_assignments pa
      WHERE pa.project_id = projects.id
      AND pa.user_id = auth.uid()
    )
  );--> statement-breakpoint

-- A property is visible to field staff if at least one project on it
-- has them assigned. Subquery against project_assignments → projects.
CREATE POLICY "Field staff view assigned properties" ON "properties" FOR SELECT TO authenticated
  USING (
    current_user_role() = 'field_staff'
    AND EXISTS (
      SELECT 1 FROM public.project_assignments pa
      INNER JOIN public.projects p ON p.id = pa.project_id
      WHERE p.property_id = properties.id
      AND pa.user_id = auth.uid()
    )
  );--> statement-breakpoint

-- Field staff need to read the client name for any property they can
-- see (the schedule + property dropdown both surface "{client} · {property}"
-- labels). Same join chain, one level higher.
CREATE POLICY "Field staff view assigned clients" ON "clients" FOR SELECT TO authenticated
  USING (
    current_user_role() = 'field_staff'
    AND EXISTS (
      SELECT 1 FROM public.project_assignments pa
      INNER JOIN public.projects p ON p.id = pa.project_id
      INNER JOIN public.properties pr ON pr.id = p.property_id
      WHERE pr.client_id = clients.id
      AND pa.user_id = auth.uid()
    )
  );--> statement-breakpoint

-- ---------- Tighten photo INSERT policy ----------------------------------

-- The previous policy only required `uploaded_by_user_id = auth.uid()`,
-- which let a field user post a photo against any project_id they
-- knew. Now the project (when set) must be one they're assigned to.
-- A NULL project_id is still allowed — those uploads attach to the
-- property only, and the server-side action also enforces that the
-- property has an assignment.
DROP POLICY IF EXISTS "Field staff insert photos" ON "photos";--> statement-breakpoint
CREATE POLICY "Field staff insert photos" ON "photos" FOR INSERT TO authenticated
  WITH CHECK (
    current_user_role() = 'field_staff'
    AND uploaded_by_user_id = auth.uid()
    AND (
      project_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.project_assignments pa
        WHERE pa.project_id = photos.project_id
        AND pa.user_id = auth.uid()
      )
    )
  );
