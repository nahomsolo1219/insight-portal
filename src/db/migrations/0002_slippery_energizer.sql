CREATE TABLE "template_phase_dependencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phase_id" uuid NOT NULL,
	"depends_on_phase_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "template_phases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"order" integer DEFAULT 0 NOT NULL,
	"estimated_duration" text,
	"estimated_days" integer,
	"photo_documentation" text DEFAULT 'before_during_after',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_templates" ADD COLUMN "uses_phases" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "template_milestones" ADD COLUMN "phase_id" uuid;--> statement-breakpoint
ALTER TABLE "template_milestones" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "template_milestones" ADD COLUMN "is_decision_point" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "template_milestones" ADD COLUMN "decision_question" text;--> statement-breakpoint
ALTER TABLE "template_milestones" ADD COLUMN "decision_type" "question_type";--> statement-breakpoint
ALTER TABLE "template_milestones" ADD COLUMN "decision_options" jsonb;--> statement-breakpoint
ALTER TABLE "template_phase_dependencies" ADD CONSTRAINT "template_phase_dependencies_phase_id_template_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."template_phases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_phase_dependencies" ADD CONSTRAINT "template_phase_dependencies_depends_on_phase_id_template_phases_id_fk" FOREIGN KEY ("depends_on_phase_id") REFERENCES "public"."template_phases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_phases" ADD CONSTRAINT "template_phases_template_id_project_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."project_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_milestones" ADD CONSTRAINT "template_milestones_phase_id_template_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."template_phases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_phases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "template_phase_dependencies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "Admin full access" ON "template_phases" FOR ALL TO authenticated USING (current_user_role() = 'admin');--> statement-breakpoint
CREATE POLICY "Admin full access" ON "template_phase_dependencies" FOR ALL TO authenticated USING (current_user_role() = 'admin');