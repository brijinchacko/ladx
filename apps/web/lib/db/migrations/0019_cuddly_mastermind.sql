CREATE TABLE IF NOT EXISTS "site_hits" (
	"day" date NOT NULL,
	"path" text NOT NULL,
	"authed" boolean DEFAULT false NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "site_hits_day_path_authed_pk" PRIMARY KEY("day","path","authed")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "site_referrers" (
	"day" date NOT NULL,
	"host" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "site_referrers_day_host_pk" PRIMARY KEY("day","host")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" text DEFAULT 'user' NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "site_hits_day_idx" ON "site_hits" USING btree ("day");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "site_referrers_day_idx" ON "site_referrers" USING btree ("day");