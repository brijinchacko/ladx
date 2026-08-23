CREATE TYPE "public"."provider_kind" AS ENUM('openrouter', 'anthropic', 'openai', 'custom');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "provider_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "provider_kind" NOT NULL,
	"masked" text NOT NULL,
	"fingerprint" text NOT NULL,
	"secret" text NOT NULL,
	"base_url" text,
	"default_model" text,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "provider_keys" ADD CONSTRAINT "provider_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_keys_user_idx" ON "provider_keys" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "provider_keys_user_kind_idx" ON "provider_keys" USING btree ("user_id","kind");