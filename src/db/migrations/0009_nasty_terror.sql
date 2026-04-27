CREATE TYPE "public"."property_status_tone" AS ENUM('green', 'amber', 'neutral', 'rose');--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "bedrooms" integer;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "bathrooms" numeric(3, 1);--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "region" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "status_label" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "status_tone" "property_status_tone";