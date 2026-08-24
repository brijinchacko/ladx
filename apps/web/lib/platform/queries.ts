import { db } from "@/lib/db/client";
import {
  type Client,
  type CompanyProfile,
  type Project,
  clients,
  companyProfiles,
  projects,
} from "@/lib/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import type { PhaseId } from "./lifecycle";

/**
 * Reads and writes for the platform: company profile, clients, projects.
 *
 * Called directly by server components, so a page renders its data without a
 * round trip to its own API. Ownership is checked on every query by user id;
 * nothing here trusts an id from the client to belong to the caller.
 */

/* ─────────────────────────── company ─────────────────────────── */

export async function getCompany(userId: string): Promise<CompanyProfile | null> {
  const [row] = await db()
    .select()
    .from(companyProfiles)
    .where(eq(companyProfiles.userId, userId))
    .limit(1);
  return row ?? null;
}

export type CompanyInput = Partial<Omit<CompanyProfile, "userId" | "createdAt" | "updatedAt">> & {
  name: string;
};

/** Create or update in one call: there is exactly one profile per user. */
export async function upsertCompany(userId: string, input: CompanyInput): Promise<void> {
  await db()
    .insert(companyProfiles)
    .values({ userId, ...input })
    .onConflictDoUpdate({
      target: companyProfiles.userId,
      set: { ...input, updatedAt: new Date() },
    });
}

/* ─────────────────────────── clients ─────────────────────────── */

export async function listClients(userId: string): Promise<(Client & { projectCount: number })[]> {
  const rows = await db()
    .select({
      client: clients,
      projectCount: sql<number>`count(${projects.id})::int`,
    })
    .from(clients)
    .leftJoin(projects, eq(projects.clientId, clients.id))
    .where(eq(clients.userId, userId))
    .groupBy(clients.id)
    .orderBy(desc(clients.createdAt));
  return rows.map((r) => ({ ...r.client, projectCount: r.projectCount }));
}

export async function getClient(userId: string, id: string): Promise<Client | null> {
  const [row] = await db()
    .select()
    .from(clients)
    .where(and(eq(clients.id, id), eq(clients.userId, userId)))
    .limit(1);
  return row ?? null;
}

export type ClientInput = Partial<Omit<Client, "id" | "userId" | "createdAt" | "updatedAt">> & {
  name: string;
};

export async function createClient(userId: string, input: ClientInput): Promise<{ id: string }> {
  const [row] = await db()
    .insert(clients)
    .values({ userId, ...input })
    .returning({ id: clients.id });
  if (!row) throw new Error("client insert returned no row");
  return row;
}

export async function updateClient(
  userId: string,
  id: string,
  input: ClientInput,
): Promise<boolean> {
  const updated = await db()
    .update(clients)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(clients.id, id), eq(clients.userId, userId)))
    .returning({ id: clients.id });
  return updated.length > 0;
}

export async function deleteClient(userId: string, id: string): Promise<boolean> {
  // Projects reference the client with ON DELETE SET NULL, so removing a client
  // orphans its projects rather than deleting them. That is the safe default:
  // the work does not vanish because the client record was tidied up.
  const deleted = await db()
    .delete(clients)
    .where(and(eq(clients.id, id), eq(clients.userId, userId)))
    .returning({ id: clients.id });
  return deleted.length > 0;
}

/* ─────────────────────────── projects ─────────────────────────── */

export interface ProjectWithClient extends Project {
  clientName: string | null;
}

export async function listProjects(userId: string): Promise<ProjectWithClient[]> {
  const rows = await db()
    .select({ project: projects, clientName: clients.name })
    .from(projects)
    .leftJoin(clients, eq(clients.id, projects.clientId))
    .where(eq(projects.userId, userId))
    .orderBy(desc(projects.updatedAt));
  return rows.map((r) => ({ ...r.project, clientName: r.clientName }));
}

export async function getProject(userId: string, id: string): Promise<ProjectWithClient | null> {
  const [row] = await db()
    .select({ project: projects, clientName: clients.name })
    .from(projects)
    .leftJoin(clients, eq(clients.id, projects.clientId))
    .where(and(eq(projects.id, id), eq(projects.userId, userId)))
    .limit(1);
  return row ? { ...row.project, clientName: row.clientName } : null;
}

export interface CreateProjectInput {
  name: string;
  clientId?: string | null;
  code?: string | null;
  description?: string | null;
  site?: string | null;
}

export async function createProject(
  userId: string,
  input: CreateProjectInput,
): Promise<{ id: string }> {
  // A supplied client id must belong to this user, or it is dropped rather than
  // trusted. This is the one place a client id arrives from a form.
  let clientId = input.clientId ?? null;
  if (clientId) {
    const owned = await getClient(userId, clientId);
    if (!owned) clientId = null;
  }

  const [row] = await db()
    .insert(projects)
    .values({
      userId,
      name: input.name,
      clientId,
      code: input.code ?? null,
      description: input.description ?? null,
      site: input.site ?? null,
    })
    .returning({ id: projects.id });
  if (!row) throw new Error("project insert returned no row");
  return row;
}

export async function updateProject(
  userId: string,
  id: string,
  input: Partial<CreateProjectInput> & { phase?: PhaseId },
): Promise<boolean> {
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.code !== undefined) patch.code = input.code;
  if (input.description !== undefined) patch.description = input.description;
  if (input.site !== undefined) patch.site = input.site;
  if (input.phase !== undefined) patch.phase = input.phase;
  if (input.clientId !== undefined) {
    // Same ownership check as create: never store a client id we cannot prove
    // the caller owns.
    if (input.clientId) {
      const owned = await getClient(userId, input.clientId);
      patch.clientId = owned ? input.clientId : null;
    } else {
      patch.clientId = null;
    }
  }

  const updated = await db()
    .update(projects)
    .set(patch)
    .where(and(eq(projects.id, id), eq(projects.userId, userId)))
    .returning({ id: projects.id });
  return updated.length > 0;
}

export async function deleteProject(userId: string, id: string): Promise<boolean> {
  const deleted = await db()
    .delete(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, userId)))
    .returning({ id: projects.id });
  return deleted.length > 0;
}
