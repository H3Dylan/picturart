ALTER TYPE "public"."notification_type" ADD VALUE 'memory';--> statement-breakpoint
CREATE TABLE "custom_reactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"image_path" text NOT NULL,
	"created_by" uuid NOT NULL,
	"source_media_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "actor_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "custom_reactions" ADD CONSTRAINT "custom_reactions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_reactions" ADD CONSTRAINT "custom_reactions_source_media_id_media_id_fk" FOREIGN KEY ("source_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "custom_reactions_created_by_idx" ON "custom_reactions" USING btree ("created_by");