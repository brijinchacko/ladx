CREATE TABLE IF NOT EXISTS "knowledge_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"text" text NOT NULL,
	"embedding" real[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "knowledge_docs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid,
	"title" text NOT NULL,
	"filename" text,
	"byte_size" integer DEFAULT 0 NOT NULL,
	"chunk_count" integer DEFAULT 0 NOT NULL,
	"embed_model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_doc_id_knowledge_docs_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."knowledge_docs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "knowledge_docs" ADD CONSTRAINT "knowledge_docs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "knowledge_docs" ADD CONSTRAINT "knowledge_docs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_chunk_doc_idx" ON "knowledge_chunks" USING btree ("doc_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_chunk_user_idx" ON "knowledge_chunks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_doc_user_idx" ON "knowledge_docs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_doc_project_idx" ON "knowledge_docs" USING btree ("project_id");