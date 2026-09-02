CREATE TABLE IF NOT EXISTS "workflow_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid,
	"workflow" text NOT NULL,
	"request" text NOT NULL,
	"answers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"model_answers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"run" jsonb,
	"status" text DEFAULT 'running' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_runs_user_idx" ON "workflow_runs" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_runs_project_idx" ON "workflow_runs" USING btree ("project_id");