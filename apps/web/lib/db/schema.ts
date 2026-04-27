// Drizzle schema for ladX.ai Cloud. Every table is `snake_case` per
// Postgres convention. Timestamps default to `now()` server-side.
//
// Indexing strategy:
// - Foreign keys get an explicit index (Postgres does NOT auto-index FKs).
// - Per-user queries are common, so user_id columns are always indexed.
// - audit_log is append-only and partitioned by month at scale (post-MVP).

import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
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
    vendor: vendorKindEnum("vendor").notNull(),
    r2Key: text("r2_key").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    tagCount: integer("tag_count").notNull().default(0),
    routineCount: integer("routine_count").notNull().default(0),
    udtCount: integer("udt_count").notNull().default(0),
    aoiCount: integer("aoi_count").notNull().default(0),
    parsedAt: timestamp("parsed_at", { withTimezone: true }),
    parseError: text("parse_error"),
    /** ProjectManifest from the Rust parser — routine/tag/UDT/AOI names. */
    manifest: jsonb("manifest").$type<{
      routines: Array<{ name: string; language: string }>;
      tags: Array<{ name: string; data_type?: string | null }>;
      udts: string[];
      aois: string[];
    }>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("projects_user_idx").on(t.userId),
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("convo_user_idx").on(t.userId),
    projectIdx: index("convo_project_idx").on(t.projectId),
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
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Subscription = typeof subscriptions.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type GeneratedCode = typeof generatedCode.$inferSelect;
export type AuditLogRow = typeof auditLog.$inferSelect;

// SQL helper kept around for future raw-SQL escape hatches.
export { sql };
