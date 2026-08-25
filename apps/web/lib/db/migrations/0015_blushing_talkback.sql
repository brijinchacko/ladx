ALTER TABLE "project_tasks" ADD COLUMN "starts_on" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD COLUMN "depends_on" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_depends_on_fk" FOREIGN KEY ("depends_on") REFERENCES "public"."project_tasks"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
