CREATE TYPE "public"."document_kind" AS ENUM('generated', 'uploaded');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cad_drawings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid,
	"name" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid,
	"client_id" uuid,
	"kind" "document_kind" DEFAULT 'generated' NOT NULL,
	"template_slug" text,
	"title" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"file_name" text,
	"mime_type" text,
	"file_data" text,
	"byte_size" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cad_drawings" ADD CONSTRAINT "cad_drawings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cad_drawings" ADD CONSTRAINT "cad_drawings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documents" ADD CONSTRAINT "documents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documents" ADD CONSTRAINT "documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documents" ADD CONSTRAINT "documents_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cad_user_idx" ON "cad_drawings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cad_project_idx" ON "cad_drawings" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_user_idx" ON "documents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_project_idx" ON "documents" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_client_idx" ON "documents" USING btree ("client_id");