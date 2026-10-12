ALTER TABLE "media_reactions" DROP CONSTRAINT "media_reactions_media_id_user_id_pk";--> statement-breakpoint
ALTER TABLE "post_reactions" DROP CONSTRAINT "post_reactions_post_id_user_id_pk";--> statement-breakpoint
ALTER TABLE "media_reactions" ADD CONSTRAINT "media_reactions_media_id_user_id_emoji_pk" PRIMARY KEY("media_id","user_id","emoji");--> statement-breakpoint
ALTER TABLE "post_reactions" ADD CONSTRAINT "post_reactions_post_id_user_id_emoji_pk" PRIMARY KEY("post_id","user_id","emoji");