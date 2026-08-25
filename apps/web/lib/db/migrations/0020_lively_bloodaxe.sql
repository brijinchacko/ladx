CREATE TABLE IF NOT EXISTS "licences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key_hash" text NOT NULL,
	"prefix" text NOT NULL,
	"issued_to" text NOT NULL,
	"email" text,
	"note" text,
	"machine_id" text,
	"activated_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	"product_version" text,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "licences_prefix_idx" ON "licences" USING btree ("prefix");