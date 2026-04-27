ALTER TABLE "properties" ADD COLUMN "cover_photo_url" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "cover_photo_uploaded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "cover_photo_uploaded_by" uuid;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_cover_photo_uploaded_by_profiles_id_fk" FOREIGN KEY ("cover_photo_uploaded_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;