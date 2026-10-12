ALTER TYPE "public"."media_variant" ADD VALUE 'video';--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "duration_ms" integer;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "processing_started_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "media_jobs_idx" ON "media" USING btree ("kind","created_at") WHERE "media"."status" = 'processing';