ALTER TABLE "documents" ADD COLUMN "status" text DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "status_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "share_token" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "shared_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "share_expires_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "documents_share_idx" ON "documents" USING btree ("share_token");