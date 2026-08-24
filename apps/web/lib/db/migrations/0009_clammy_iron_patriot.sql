ALTER TABLE "conversations" ADD COLUMN "pinned" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "share_token" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "shared_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "convo_share_idx" ON "conversations" USING btree ("share_token");