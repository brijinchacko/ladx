CREATE TYPE "public"."memory_kind" AS ENUM('convention', 'approved', 'forbidden', 'note');--> statement-breakpoint
CREATE TYPE "public"."memory_scope" AS ENUM('user', 'company', 'project');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"scope" "memory_scope" NOT NULL,
	"kind" "memory_kind" NOT NULL,
	"project_id" uuid,
	"content" text NOT NULL,
	"reason" text,
	"author" text NOT NULL,
	"supersedes" uuid,
	"superseded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "memories" ADD CONSTRAINT "memories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "memories" ADD CONSTRAINT "memories_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memories_user_idx" ON "memories" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memories_project_idx" ON "memories" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memories_current_idx" ON "memories" USING btree ("user_id","superseded_by");