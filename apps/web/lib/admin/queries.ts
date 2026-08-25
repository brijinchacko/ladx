/**
 * What the administrator is allowed to see.
 *
 * Every query in this file is written out by hand rather than selecting whole
 * rows, and that is the point of the file existing. An admin page that does
 * `select().from(users)` ships the password hash to the browser the day
 * somebody adds a field to the table and forgets this exists. So the columns
 * are named, and the ones that must never leave the server are named here as
 * the reason:
 *
 *   users.password_hash      never, under any circumstance
 *   provider_keys.*          never; the whole point of the envelope is that
 *                            nothing reads it back out except inference
 *   auth_tokens.*            a live reset token is a way into an account
 *   documents.file_data      somebody else's uploaded file
 *   knowledge_chunks.*       the text of somebody else's manuals
 *
 * What an administrator legitimately needs is who is here, whether the thing
 * is working, and how much it is being used. All three can be answered from
 * counts and timestamps, so that is what this returns.
 */

import { db } from "@/lib/db/client";
import {
  auditLog,
  cadDrawings,
  clients,
  conversations,
  documents,
  hmiProjects,
  knowledgeDocs,
  ladderPrograms,
  messages,
  projectTasks,
  projects,
  providerKeys,
  sessions,
  siteHits,
  siteReferrers,
  users,
} from "@/lib/db/schema";
import { and, count, desc, eq, gte, ilike, inArray, or, sql } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";

/* ─────────────────────────────── overview ─────────────────────────────── */

export interface Totals {
  users: number;
  usersThisWeek: number;
  activeSessions: number;
  projects: number;
  clients: number;
  ladderPrograms: number;
  hmiApplications: number;
  drawings: number;
  documents: number;
  knowledgeDocs: number;
  conversations: number;
  messages: number;
  tasks: number;
  providersConnected: number;
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86_400_000);
}

/** One round trip per table rather than a join: these are all trivial counts. */
export async function totals(): Promise<Totals> {
  const d = db();
  const one = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;

  const [
    usersN,
    weekN,
    sessionsN,
    projectsN,
    clientsN,
    ladderN,
    hmiN,
    cadN,
    docsN,
    knowledgeN,
    convN,
    msgN,
    taskN,
    provN,
  ] = await Promise.all([
    one(d.select({ n: count() }).from(users)),
    one(
      d
        .select({ n: count() })
        .from(users)
        .where(gte(users.createdAt, daysAgo(7))),
    ),
    one(d.select({ n: count() }).from(sessions).where(gte(sessions.expiresAt, new Date()))),
    one(d.select({ n: count() }).from(projects)),
    one(d.select({ n: count() }).from(clients)),
    one(d.select({ n: count() }).from(ladderPrograms)),
    one(d.select({ n: count() }).from(hmiProjects)),
    one(d.select({ n: count() }).from(cadDrawings)),
    one(d.select({ n: count() }).from(documents)),
    one(d.select({ n: count() }).from(knowledgeDocs)),
    one(d.select({ n: count() }).from(conversations)),
    one(d.select({ n: count() }).from(messages)),
    one(d.select({ n: count() }).from(projectTasks)),
    one(d.select({ n: count() }).from(providerKeys)),
  ]);

  return {
    users: usersN,
    usersThisWeek: weekN,
    activeSessions: sessionsN,
    projects: projectsN,
    clients: clientsN,
    ladderPrograms: ladderN,
    hmiApplications: hmiN,
    drawings: cadN,
    documents: docsN,
    knowledgeDocs: knowledgeN,
    conversations: convN,
    messages: msgN,
    tasks: taskN,
    providersConnected: provN,
  };
}

/* ──────────────────────────────── users ──────────────────────────────── */

export interface AdminUserRow {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  createdAt: Date;
  /** The newest session's expiry, which is the closest honest thing to "last seen". */
  lastSessionAt: Date | null;
  projects: number;
  programs: number;
  hmi: number;
  drawings: number;
  documents: number;
  conversations: number;
  /** Whether a key is on file. Never which, never the key. */
  hasProvider: boolean;
}

/**
 * A page of accounts, with what each has built.
 *
 * Grouped counts joined in memory rather than a correlated subquery per
 * column, and that is not a style preference. Written the obvious way,
 * `sql`(select count(*) from projects p where p.user_id = ${users.id})``,
 * Drizzle renders the column reference as a bare `"id"`, which inside the
 * subquery binds to `projects.id` instead of `users.id`. The query is valid,
 * returns zero for everybody, and says nothing about being wrong. Every figure
 * on the People page read zero until somebody noticed the demo account had
 * built four HMI applications and the table disagreed.
 *
 * Six small aggregates over the ids on the page cannot fail that way, and at
 * fifty rows they cost less than the round trip.
 */
export async function listUsers(opts: {
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ rows: AdminUserRow[]; total: number }> {
  const d = db();
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);
  const q = opts.search?.trim();

  const where = q
    ? or(ilike(users.email, `%${q}%`), ilike(users.displayName, `%${q}%`))
    : undefined;

  const page = await d
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      role: users.role,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(where)
    .orderBy(desc(users.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ n } = { n: 0 }] = await d.select({ n: count() }).from(users).where(where);

  const ids = page.map((u) => u.id);
  if (ids.length === 0) return { rows: [], total: n };

  /**
   * How many rows each of these users owns in one table.
   *
   * `PgTable` and `PgColumn` rather than the shape of one particular table:
   * typed against `projects` it only accepts `projects`, and casting each call
   * site to `never` to get around that is how a wrong column gets passed.
   */
  const tally = async (table: PgTable, column: PgColumn): Promise<Map<string, number>> => {
    const rows = await d
      .select({ userId: column, n: count() })
      .from(table)
      .where(inArray(column, ids))
      .groupBy(column);
    return new Map(rows.map((r) => [String(r.userId), Number(r.n)]));
  };

  const [proj, prog, hmi, cad, docs, convs, lastSeen, withKey] = await Promise.all([
    tally(projects, projects.userId),
    tally(ladderPrograms, ladderPrograms.userId),
    tally(hmiProjects, hmiProjects.userId),
    tally(cadDrawings, cadDrawings.userId),
    tally(documents, documents.userId),
    tally(conversations, conversations.userId),
    d
      .select({ userId: sessions.userId, at: sql<Date>`max(${sessions.createdAt})` })
      .from(sessions)
      .where(inArray(sessions.userId, ids))
      .groupBy(sessions.userId),
    d
      .select({ userId: providerKeys.userId })
      .from(providerKeys)
      .where(inArray(providerKeys.userId, ids))
      .groupBy(providerKeys.userId),
  ]);

  const seen = new Map(lastSeen.map((r) => [String(r.userId), r.at]));
  const keyed = new Set(withKey.map((r) => String(r.userId)));

  const rows: AdminUserRow[] = page.map((u) => ({
    ...u,
    lastSessionAt: seen.get(u.id) ?? null,
    projects: proj.get(u.id) ?? 0,
    programs: prog.get(u.id) ?? 0,
    hmi: hmi.get(u.id) ?? 0,
    drawings: cad.get(u.id) ?? 0,
    documents: docs.get(u.id) ?? 0,
    conversations: convs.get(u.id) ?? 0,
    hasProvider: keyed.has(u.id),
  }));

  return { rows, total: n };
}

export async function getUserDetail(id: string) {
  const d = db();
  const [row] = await d
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      role: users.role,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!row) return null;

  const [projectRows, sessionRows, events, provider] = await Promise.all([
    d
      .select({
        id: projects.id,
        name: projects.name,
        phase: projects.phase,
        createdAt: projects.createdAt,
        updatedAt: projects.updatedAt,
      })
      .from(projects)
      .where(eq(projects.userId, id))
      .orderBy(desc(projects.updatedAt))
      .limit(25),
    d
      .select({ createdAt: sessions.createdAt, expiresAt: sessions.expiresAt })
      .from(sessions)
      .where(eq(sessions.userId, id))
      .orderBy(desc(sessions.createdAt))
      .limit(10),
    d
      .select({
        event: auditLog.event,
        subjectId: auditLog.subjectId,
        timestamp: auditLog.timestamp,
      })
      .from(auditLog)
      .where(eq(auditLog.userId, id))
      .orderBy(desc(auditLog.timestamp))
      .limit(30),
    // The kind and when. Not the key, and not the masked preview either: the
    // preview ends in the last four characters of the real key, which is fine
    // for the person who pasted it and is not fine for somebody else looking
    // at their account. lib/crypto/secrets.ts exists so that nothing but
    // inference reads one, and an admin page is not inference.
    d
      .select({
        kind: providerKeys.kind,
        createdAt: providerKeys.createdAt,
      })
      .from(providerKeys)
      .where(eq(providerKeys.userId, id)),
  ]);

  return { user: row, projects: projectRows, sessions: sessionRows, events, provider };
}

export async function setUserRole(id: string, role: "user" | "admin"): Promise<void> {
  await db().update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, id));
}

/* ─────────────────────────────── traffic ─────────────────────────────── */

export interface DayCount {
  day: string;
  total: number;
  authed: number;
}

export async function trafficByDay(days = 30): Promise<DayCount[]> {
  const from = isoDay(daysAgo(days));
  const rows = await db()
    .select({
      day: siteHits.day,
      total: sql<number>`sum(${siteHits.count})::int`,
      authed: sql<number>`sum(case when ${siteHits.authed} then ${siteHits.count} else 0 end)::int`,
    })
    .from(siteHits)
    .where(gte(siteHits.day, from))
    .groupBy(siteHits.day)
    .orderBy(siteHits.day);
  return rows.map((r) => ({ day: String(r.day), total: r.total, authed: r.authed }));
}

export async function topPaths(days = 30, limit = 30) {
  const from = isoDay(daysAgo(days));
  return db()
    .select({
      path: siteHits.path,
      total: sql<number>`sum(${siteHits.count})::int`,
      authed: sql<number>`sum(case when ${siteHits.authed} then ${siteHits.count} else 0 end)::int`,
    })
    .from(siteHits)
    .where(gte(siteHits.day, from))
    .groupBy(siteHits.path)
    .orderBy(desc(sql`sum(${siteHits.count})`))
    .limit(limit);
}

export async function topReferrers(days = 30, limit = 20) {
  const from = isoDay(daysAgo(days));
  return db()
    .select({ host: siteReferrers.host, total: sql<number>`sum(${siteReferrers.count})::int` })
    .from(siteReferrers)
    .where(gte(siteReferrers.day, from))
    .groupBy(siteReferrers.host)
    .orderBy(desc(sql`sum(${siteReferrers.count})`))
    .limit(limit);
}

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* ────────────────────────── activity and errors ────────────────────────── */

/**
 * Sign-ups a day, for the last month.
 *
 * generate_series rather than grouping what exists, so a day with no sign-ups
 * is a zero on the chart rather than a gap the eye reads as a shorter month.
 */
export async function signupsByDay(days = 30): Promise<DayCount[]> {
  const rows = await db().execute(sql`
    select to_char(d.day, 'YYYY-MM-DD') as day,
           coalesce(count(u.id), 0)::int as total
      from generate_series(
             current_date - ${days}::int * interval '1 day',
             current_date,
             interval '1 day'
           ) as d(day)
      left join users u on u.created_at::date = d.day::date
     group by d.day
     order by d.day
  `);
  return (rows as unknown as { day: string; total: number }[]).map((r) => ({
    day: r.day,
    total: Number(r.total),
    authed: 0,
  }));
}

export async function recentEvents(limit = 40) {
  return db()
    .select({
      event: auditLog.event,
      actor: auditLog.actor,
      subjectId: auditLog.subjectId,
      timestamp: auditLog.timestamp,
      email: users.email,
    })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.userId))
    .orderBy(desc(auditLog.timestamp))
    .limit(limit);
}

/** Which events happened how often in the window, so a spike in one is visible. */
export async function eventCounts(days = 7) {
  return db()
    .select({ event: auditLog.event, n: count() })
    .from(auditLog)
    .where(gte(auditLog.timestamp, daysAgo(days)))
    .groupBy(auditLog.event)
    .orderBy(desc(count()));
}

/* ──────────────────────────────── status ──────────────────────────────── */

export interface DbStatus {
  ok: boolean;
  latencyMs: number | null;
  version: string | null;
  sizeBytes: number | null;
  migrations: number | null;
  error: string | null;
}

export async function dbStatus(): Promise<DbStatus> {
  const started = Date.now();
  try {
    const d = db();
    const ver = await d.execute(sql`select version() as v`);
    const size = await d.execute(sql`select pg_database_size(current_database())::bigint as bytes`);
    let migrations: number | null = null;
    try {
      const m = await d.execute(sql`select count(*)::int as n from drizzle.__drizzle_migrations`);
      migrations = Number((m as unknown as { n: number }[])[0]?.n ?? 0);
    } catch {
      // The table lives in a schema drizzle creates. Not being able to read it
      // is worth reporting as unknown rather than as a failure.
    }
    return {
      ok: true,
      latencyMs: Date.now() - started,
      version: String((ver as unknown as { v: string }[])[0]?.v ?? "").split(" on ")[0] ?? null,
      sizeBytes: Number((size as unknown as { bytes: string }[])[0]?.bytes ?? 0),
      migrations,
      error: null,
    };
  } catch (e) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      version: null,
      sizeBytes: null,
      migrations: null,
      error: e instanceof Error ? e.message : "unreachable",
    };
  }
}

/** Rows per table, so a table that is unexpectedly empty or huge is visible. */
export async function tableSizes() {
  const rows = await db().execute(sql`
    select relname as table,
           n_live_tup::int as rows,
           pg_total_relation_size(relid)::bigint as bytes
      from pg_stat_user_tables
     order by pg_total_relation_size(relid) desc
     limit 40
  `);
  return (rows as unknown as { table: string; rows: number; bytes: string }[]).map((r) => ({
    table: r.table,
    rows: Number(r.rows),
    bytes: Number(r.bytes),
  }));
}

/** Whether the traffic counter can write at all. */
export async function metricsEnabled(): Promise<boolean> {
  return Boolean(process.env.LADX_SECRETS_KEY);
}

export async function trafficSince(): Promise<string | null> {
  const [row] = await db()
    .select({ day: sql<string>`min(${siteHits.day})` })
    .from(siteHits);
  return row?.day ? String(row.day) : null;
}

export { and, eq };
