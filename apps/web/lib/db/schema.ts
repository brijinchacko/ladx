// Drizzle schema for ladX.ai Cloud. Every table is `snake_case` per
// Postgres convention. Timestamps default to `now()` server-side.
//
// Indexing strategy:
// - Foreign keys get an explicit index (Postgres does NOT auto-index FKs).
// - Per-user queries are common, so user_id columns are always indexed.
// - audit_log is append-only and partitioned by month at scale (post-MVP).

import type { ProjectBrief } from "@/lib/platform/brief";
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ----- enums -----

export const vendorKindEnum = pgEnum("vendor_kind", [
  "siemens",
  "rockwell",
  "beckhoff",
  "codesys",
  "mitsubishi",
]);

export const subscriptionTierEnum = pgEnum("subscription_tier", [
  "free",
  "pro",
  "site",
  "enterprise",
]);

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "active",
  "past_due",
  "canceled",
  "incomplete",
  "trialing",
  "unpaid",
]);

export const messageRoleEnum = pgEnum("message_role", ["system", "user", "assistant"]);

/**
 * The phases a control system project moves through, in order.
 *
 * This is the standard integrator lifecycle: capture what the client needs,
 * design how it works, build it, prove it on the bench, prove it on site, hand
 * it over, then support it. Each phase has deliverables, which are the document
 * templates the platform can generate with the project already filled in.
 */
export const projectPhaseEnum = pgEnum("project_phase", [
  "requirements",
  "design",
  "development",
  "factory_test",
  "commissioning",
  "handover",
  "support",
  "closed",
]);

export const authTokenKindEnum = pgEnum("auth_token_kind", [
  "password_reset",
  "magic_link",
  "email_verify",
]);

// ----- users -----
// Native auth. `password_hash` is bcrypt; `email` is unique and the
// canonical login identifier. OAuth providers can be layered on later
// via a separate `user_oauth_accounts` join table.
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    displayName: text("display_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    emailIdx: index("users_email_idx").on(t.email),
  }),
);

// ----- sessions -----
// Server-side session store. Cookie holds the session id; the row holds
// the user binding + expiry. Sessions are deleted on logout and pruned
// on access when expired.
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("sessions_user_idx").on(t.userId),
    expiresIdx: index("sessions_expires_idx").on(t.expiresAt),
  }),
);

// ----- subscriptions -----
// DORMANT. Billing was removed when LADX moved to bring-your-own-key: users
// pay their own provider, so there is nothing to meter. The table is left in
// place (unread, unwritten) rather than migrated away, so that reinstating
// billing later is an additive change instead of a schema resurrection.
// One row per user. Stripe customer + subscription IDs link back.
export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  stripeCustomerId: text("stripe_customer_id").unique(),
  stripeSubscriptionId: text("stripe_subscription_id").unique(),
  tier: subscriptionTierEnum("tier").notNull().default("free"),
  status: subscriptionStatusEnum("status").notNull().default("active"),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  promptsUsedThisPeriod: integer("prompts_used_this_period").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ----- projects -----
// Project file content lives in R2; only metadata + parsed stats live here.
export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // A project can exist before any PLC file is uploaded to it, so these are
    // nullable now. The upload path still fills them; a project created from the
    // platform simply has no file yet.
    vendor: vendorKindEnum("vendor"),
    r2Key: text("r2_key"),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    tagCount: integer("tag_count").notNull().default(0),
    routineCount: integer("routine_count").notNull().default(0),
    udtCount: integer("udt_count").notNull().default(0),
    aoiCount: integer("aoi_count").notNull().default(0),
    parsedAt: timestamp("parsed_at", { withTimezone: true }),
    parseError: text("parse_error"),
    /** ProjectManifest from the Rust parser, routine/tag/UDT/AOI names. */
    manifest: jsonb("manifest").$type<{
      routines: Array<{ name: string; language: string }>;
      tags: Array<{ name: string; data_type?: string | null }>;
      udts: string[];
      aois: string[];
    }>(),
    // ----- engagement fields: the project as a client job, not just a file -----
    // The client this project is for. Nullable, because a scratch project need
    // not belong to anyone yet, and because every project that predates this
    // column has no client.
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    /** Project number, e.g. LX-2601. Used as the stem of every document number. */
    code: text("code"),
    description: text("description"),
    /** Where in the lifecycle this project is. Drives the workflow view. */
    phase: projectPhaseEnum("phase").notNull().default("requirements"),
    /** Free-form site or plant location, printed on documents. */
    site: text("site"),
    /**
     * The design basis: goal, platform, power, safety, acceptance. Captured once
     * on the project and read by every document it generates, so the hardware
     * summary in the FDS cannot drift from the one in the BOM.
     *
     * jsonb rather than a column per field because the set is still settling and
     * nothing joins on it. Shape and field registry live in lib/platform/brief.ts.
     */
    brief: jsonb("brief").$type<ProjectBrief>(),
    /**
     * When the setup wizard was finished or dismissed.
     *
     * Not derivable from whether the brief is empty: skipping the wizard is a
     * decision, and a project page that re-opened it on every visit because the
     * fields are still blank would be nagging rather than helping. Null means
     * the wizard has never been closed, so it opens once.
     */
    onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("projects_user_idx").on(t.userId),
    clientIdx: index("projects_client_idx").on(t.clientId),
  }),
);

// ----- ladder programs -----
//
// One program per project, so the Ladder editor and the Monitor are working on
// the same thing. Before this the editor only had a browser-local "scratch"
// project, which meant a program could not belong to a job, could not be opened
// on another machine, and could not be run against the project it was written
// for.
//
// The program is jsonb rather than a parsed table of rungs. It is authored and
// read as one document, nothing joins on a rung, and the shape is owned by
// @ladx/studio, which is the thing entitled to change it.
export const ladderPrograms = pgTable(
  "ladder_programs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Null is the user's unattached scratch program, of which there is one. */
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull().default("Untitled program"),
    /** LadxProgram from @ladx/studio. */
    program: jsonb("program").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("ladder_programs_user_idx").on(t.userId),
    // One program per project. Postgres treats NULLs as distinct in a unique
    // index, so this constrains attached programs only; the single unattached
    // scratch program per user is kept unique by the upsert in lib/db/ladder.ts
    // rather than by the database. That is deliberate: NULLS NOT DISTINCT needs
    // Postgres 15, and this schema should not carry a version floor for one row.
    projectUnique: uniqueIndex("ladder_programs_project_unique").on(t.userId, t.projectId),
  }),
);

// ----- conversations -----
// One thread per (user, project). New conversations can branch off later.
export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    title: text("title"),
    /** Pinned conversations sort above the rest and survive the recent cutoff. */
    pinned: boolean("pinned").notNull().default(false),
    /**
     * Set when the conversation has been shared.
     *
     * A random token rather than the row id: the id is used in authenticated
     * URLs, and reusing it would mean anyone who saw a private URL could reach
     * the public one. Nulling this revokes the link.
     */
    shareToken: text("share_token"),
    sharedAt: timestamp("shared_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("convo_user_idx").on(t.userId),
    projectIdx: index("convo_project_idx").on(t.projectId),
    shareIdx: uniqueIndex("convo_share_idx").on(t.shareToken),
  }),
);

// ----- messages -----
export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: messageRoleEnum("role").notNull(),
    content: text("content").notNull(),
    tokenCount: integer("token_count"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    convoIdx: index("msg_convo_idx").on(t.conversationId),
  }),
);

// ----- generated_code -----
// Every accepted code generation is recorded as a positive training pair.
export const generatedCode = pgTable(
  "generated_code",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    messageId: uuid("message_id").references(() => messages.id, { onDelete: "set null" }),
    language: text("language").notNull(),
    source: text("source").notNull(),
    accepted: boolean("accepted").notNull().default(false),
    validatorReport: jsonb("validator_report"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("gencode_user_idx").on(t.userId),
    projectIdx: index("gencode_project_idx").on(t.projectId),
  }),
);

// ----- audit_log -----
// Append-only. CI / migration enforces deny-update + deny-delete via RLS.
// Phase 1 ships the table; the RLS policy is a follow-up migration.
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    actor: text("actor").notNull(),
    event: text("event").notNull(),
    subjectId: text("subject_id"),
    payload: jsonb("payload"),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("audit_user_idx").on(t.userId),
    timeIdx: index("audit_time_idx").on(t.timestamp),
  }),
);

// ----- auth_tokens -----
// Single-use tokens for password reset, magic-link sign-in, email
// verification. We store a bcrypt hash of the token so a leaked DB
// can't replay live tokens. The plaintext is in the email link only.
export const authTokens = pgTable(
  "auth_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: authTokenKindEnum("kind").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userKindIdx: index("auth_tokens_user_kind_idx").on(t.userId, t.kind),
    expiresIdx: index("auth_tokens_expires_idx").on(t.expiresAt),
  }),
);

// ----- exports -----
// Aggregate type used by lib/db/client.ts.
export const schema = {
  users,
  sessions,
  subscriptions,
  projects,
  conversations,
  messages,
  generatedCode,
  auditLog,
  authTokens,
};

// Helpful inferred types.
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type AuthToken = typeof authTokens.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Subscription = typeof subscriptions.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type GeneratedCode = typeof generatedCode.$inferSelect;
export type AuditLogRow = typeof auditLog.$inferSelect;

// SQL helper kept around for future raw-SQL escape hatches.
export { sql };

// ----- provider keys -----
// A user's own credentials for their AI provider. LADX holds no shared
// inference key, so this table is the only way a request gets made at all.
//
// `secret` is an AES-256-GCM envelope (see lib/crypto/secrets.ts), never a
// key. `masked` and `fingerprint` exist so the UI can show which key is
// connected, and so we can answer "is this the same one?" without opening
// the envelope. Nothing here is ever returned to the client in the clear.
export const providerKindEnum = pgEnum("provider_kind", [
  "openrouter",
  "anthropic",
  "openai",
  "custom",
]);

export const providerKeys = pgTable(
  "provider_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: providerKindEnum("kind").notNull(),
    /** Shown in the UI: "sk-or-v1-••••a91f". Never the key. */
    masked: text("masked").notNull(),
    /** Non-reversible; used to detect a re-paste of the same key. */
    fingerprint: text("fingerprint").notNull(),
    /** The sealed envelope. */
    secret: text("secret").notNull(),
    /** Required for `custom`; the OpenAI-compatible base URL. */
    baseUrl: text("base_url"),
    /** Which model this provider should use by default for this user. */
    defaultModel: text("default_model"),
    /** Set when a live call last succeeded, so the UI can show staleness. */
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("provider_keys_user_idx").on(t.userId),
    // One key per provider per user: connecting again replaces rather than
    // accumulates, because two keys for the same provider has no meaning and
    // every read would need a tie-break rule.
    userKindIdx: uniqueIndex("provider_keys_user_kind_idx").on(t.userId, t.kind),
  }),
);

// ----- forum -----
//
// Categories are configuration rather than rows: they change with the product,
// not with user activity, and keeping them in code means a category rename is a
// deploy rather than a migration plus a data fix.
//
// Threads carry a denormalised reply count and last-activity timestamp. The
// alternative is a correlated subquery on every index page load, and the index
// page is the one people hit most.

export const forumThreads = pgTable(
  "forum_threads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    title: text("title").notNull(),
    // URL form of the title, with a short random suffix so two threads asking
    // the same question do not collide.
    slug: text("slug").notNull(),
    body: text("body").notNull(),
    replyCount: integer("reply_count").notNull().default(0),
    // Set when the author marks a reply as the one that solved it.
    answerPostId: uuid("answer_post_id"),
    locked: boolean("locked").notNull().default(false),
    pinned: boolean("pinned").notNull().default(false),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    slugIdx: uniqueIndex("forum_thread_slug_idx").on(t.slug),
    categoryIdx: index("forum_thread_category_idx").on(t.category),
    authorIdx: index("forum_thread_author_idx").on(t.authorId),
    // The default sort on every listing page.
    activityIdx: index("forum_thread_activity_idx").on(t.lastActivityAt),
  }),
);

export const forumPosts = pgTable(
  "forum_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => forumThreads.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    // Soft delete: removing a reply mid-thread would orphan the replies that
    // quote it, so the row stays and the body is hidden.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    threadIdx: index("forum_post_thread_idx").on(t.threadId),
    authorIdx: index("forum_post_author_idx").on(t.authorId),
  }),
);

export type ForumThread = typeof forumThreads.$inferSelect;
export type NewForumThread = typeof forumThreads.$inferInsert;
export type ForumPost = typeof forumPosts.$inferSelect;
export type NewForumPost = typeof forumPosts.$inferInsert;

// ----- knowledge -----
//
// Documents a user has indexed, and the chunks they were split into.
//
// Embeddings are stored as `real[]` rather than a pgvector column. That is a
// deliberate trade: this database is shared with fifteen unrelated applications,
// and installing an extension into it to serve one feature is a change to
// everyone else's server. Similarity is computed in the application over the
// user's own chunks, which is fine at the scale a single engineer's manual
// library reaches and is documented in lib/knowledge/search.ts along with the
// point at which it stops being fine.

export const knowledgeDocs = pgTable(
  "knowledge_docs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    filename: text("filename"),
    byteSize: integer("byte_size").notNull().default(0),
    chunkCount: integer("chunk_count").notNull().default(0),
    /** Recorded because vectors from different models cannot be compared. */
    embedModel: text("embed_model").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("knowledge_doc_user_idx").on(t.userId),
    projectIdx: index("knowledge_doc_project_idx").on(t.projectId),
  }),
);

export const knowledgeChunks = pgTable(
  "knowledge_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    docId: uuid("doc_id")
      .notNull()
      .references(() => knowledgeDocs.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Position in the document, so a citation can say where it came from. */
    ordinal: integer("ordinal").notNull(),
    text: text("text").notNull(),
    /** Unit length, so cosine similarity is a plain dot product. */
    embedding: real("embedding").array().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    docIdx: index("knowledge_chunk_doc_idx").on(t.docId),
    userIdx: index("knowledge_chunk_user_idx").on(t.userId),
  }),
);

export type KnowledgeDoc = typeof knowledgeDocs.$inferSelect;
export type KnowledgeChunk = typeof knowledgeChunks.$inferSelect;

// ----- company profile -----
//
// One per user. This is the letterhead: the name, logo and contact details that
// appear on every document the platform generates. Storing it once and stamping
// it onto documents is the whole point, an engineer should enter their company
// details on the day they sign up and never type them into a document again.
//
// The logo is kept as a data URL in a text column rather than in object storage.
// It is small (capped at ~1 MB on the way in), it has to be embedded inline in
// generated HTML and PDF anyway, and there is no object store wired up on this
// host. A 50 MB PLC file would never go here; a 40 KB PNG is fine.
export const companyProfiles = pgTable("company_profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  /** Data URL: "data:image/png;base64,...". Rendered on every document. */
  logo: text("logo"),
  addressLine1: text("address_line1"),
  addressLine2: text("address_line2"),
  city: text("city"),
  region: text("region"),
  postcode: text("postcode"),
  country: text("country"),
  phone: text("phone"),
  email: text("email"),
  website: text("website"),
  /** Company registration number, printed on formal documents. */
  registrationNumber: text("registration_number"),
  vatNumber: text("vat_number"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ----- clients -----
//
// The people the work is for. A project belongs to a client, and the client's
// details flow into every document that project generates, so they are entered
// once here rather than on each document.
export const clients = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    contactName: text("contact_name"),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    addressLine1: text("address_line1"),
    addressLine2: text("address_line2"),
    city: text("city"),
    region: text("region"),
    postcode: text("postcode"),
    country: text("country"),
    /** e.g. Food and beverage, Water, Automotive. Useful context on documents. */
    industry: text("industry"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("clients_user_idx").on(t.userId),
  }),
);

export type CompanyProfile = typeof companyProfiles.$inferSelect;
export type Client = typeof clients.$inferSelect;
export type NewClient = typeof clients.$inferInsert;
export type Project = typeof projects.$inferSelect;

// ----- documents -----
//
// Two kinds of thing live in one table, because they are the same thing to the
// person using them: a document attached to a project or a client.
//
// `generated` starts from a template, is filled from the project and company,
// and is then editable, so the row keeps its markdown rather than regenerating
// from the template every time. Editing is the point: a template gets you 90%
// of an FDS and the last 10% is the actual job.
//
// `uploaded` is a file the user brought, a datasheet or a signed scan. Its bytes
// live in `fileData` as a data URL for the same reason the company logo does:
// there is no object store on this host, and these are documents rather than
// 50 MB PLC archives. The size cap is enforced at the API.
export const documentKindEnum = pgEnum("document_kind", ["generated", "uploaded"]);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // A document can hang off a project, a client, or both. Both nullable so a
    // loose document is possible rather than forbidden.
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
    kind: documentKindEnum("kind").notNull().default("generated"),
    /** Which template this came from, when it was generated from one. */
    templateSlug: text("template_slug"),
    title: text("title").notNull(),
    /** Markdown, editable. Empty for uploads. */
    content: text("content").notNull().default(""),
    /** Uploads only: the original file, as a data URL. */
    fileName: text("file_name"),
    mimeType: text("mime_type"),
    fileData: text("file_data"),
    byteSize: integer("byte_size").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("documents_user_idx").on(t.userId),
    projectIdx: index("documents_project_idx").on(t.projectId),
    clientIdx: index("documents_client_idx").on(t.clientId),
  }),
);

// ----- CAD drawings -----
//
// Vector drawings for a project: panel layouts, wiring schematics, GA drawings.
//
// Entities are stored as JSON rather than as a DXF blob, because the editor
// works on structured entities and re-parsing a text format on every load would
// be slower and lossier than keeping the structure. DXF is the interchange
// format on the way in and out, not the storage format.
export const cadDrawings = pgTable(
  "cad_drawings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Entities and layers. Shape defined in lib/cad/types.ts. */
    data: jsonb("data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("cad_user_idx").on(t.userId),
    projectIdx: index("cad_project_idx").on(t.projectId),
  }),
);

export type DocumentRow = typeof documents.$inferSelect;
export type CadDrawing = typeof cadDrawings.$inferSelect;
