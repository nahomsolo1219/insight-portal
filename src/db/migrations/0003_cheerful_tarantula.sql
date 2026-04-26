CREATE TYPE "public"."vendor_document_type" AS ENUM('insurance', 'w9', 'license', 'contract', 'certificate', 'other');--> statement-breakpoint
CREATE TABLE "vendor_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "vendor_document_type" NOT NULL,
	"storage_path" text NOT NULL,
	"expiration_date" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vendor_documents" ADD CONSTRAINT "vendor_documents_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_documents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "Admin full access" ON "vendor_documents" FOR ALL TO authenticated USING (current_user_role() = 'admin');