import { db } from "@/lib/db/client";
import {
  type ClientContact,
  type ClientSite,
  type ClientStandards,
  clientContacts,
  clientSites,
  clientStandards,
  clients,
} from "@/lib/db/schema";
import { and, asc, desc, eq } from "drizzle-orm";

/**
 * Everything a client is, beyond its name and address.
 *
 * Separate from `queries.ts` because that file is the platform's general
 * reading and this is one feature's worth of writing, and because every
 * function here has the same obligation: scope by `userId` on the way in and on
 * the way out. A client's contact list is personal data belonging to somebody
 * else's business, and the only thing standing between two accounts is that
 * every query in this file says whose it is.
 *
 * The ownership check is doubled on purpose. A contact belongs to a client and
 * the client belongs to a user, so filtering by `clientId` alone would be
 * enough if the client id could be trusted. It arrives in a URL, so it cannot
 * be. Every query filters on both.
 */

/* ──────────────────────────── contacts ──────────────────────────── */

export async function listContacts(userId: string, clientId: string): Promise<ClientContact[]> {
  return (
    db()
      .select()
      .from(clientContacts)
      .where(and(eq(clientContacts.userId, userId), eq(clientContacts.clientId, clientId)))
      // The one that goes on documents first, then by name, so the list reads the
      // same way every time rather than by whenever somebody happened to add them.
      .orderBy(desc(clientContacts.isPrimary), asc(clientContacts.name))
  );
}

export interface ContactInput {
  name: string;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  siteId?: string | null;
  isPrimary?: boolean;
  notes?: string | null;
}

/**
 * Whether this client exists and belongs to this user.
 *
 * Called before every write. Without it, a client id from a URL would be enough
 * to add a contact to somebody else's client, and the row would look perfectly
 * legitimate afterwards.
 */
async function ownsClient(userId: string, clientId: string): Promise<boolean> {
  const [row] = await db()
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.userId, userId)))
    .limit(1);
  return Boolean(row);
}

export async function addContact(
  userId: string,
  clientId: string,
  input: ContactInput,
): Promise<{ id: string } | null> {
  if (!(await ownsClient(userId, clientId))) return null;
  if (input.isPrimary) await clearPrimary(userId, clientId);
  const [row] = await db()
    .insert(clientContacts)
    .values({ ...input, userId, clientId })
    .returning({ id: clientContacts.id });
  return row ?? null;
}

export async function updateContact(
  userId: string,
  id: string,
  input: Partial<ContactInput>,
): Promise<boolean> {
  const [existing] = await db()
    .select({ clientId: clientContacts.clientId })
    .from(clientContacts)
    .where(and(eq(clientContacts.id, id), eq(clientContacts.userId, userId)))
    .limit(1);
  if (!existing) return false;
  // Only one contact goes on documents, so promoting one demotes the rest.
  if (input.isPrimary) await clearPrimary(userId, existing.clientId);
  const result = await db()
    .update(clientContacts)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(clientContacts.id, id), eq(clientContacts.userId, userId)))
    .returning({ id: clientContacts.id });
  return result.length > 0;
}

async function clearPrimary(userId: string, clientId: string): Promise<void> {
  await db()
    .update(clientContacts)
    .set({ isPrimary: false })
    .where(and(eq(clientContacts.userId, userId), eq(clientContacts.clientId, clientId)));
}

export async function deleteContact(userId: string, id: string): Promise<boolean> {
  const result = await db()
    .delete(clientContacts)
    .where(and(eq(clientContacts.id, id), eq(clientContacts.userId, userId)))
    .returning({ id: clientContacts.id });
  return result.length > 0;
}

/* ───────────────────────────── sites ───────────────────────────── */

export async function listSites(userId: string, clientId: string): Promise<ClientSite[]> {
  return db()
    .select()
    .from(clientSites)
    .where(and(eq(clientSites.userId, userId), eq(clientSites.clientId, clientId)))
    .orderBy(asc(clientSites.name));
}

export interface SiteInput {
  name: string;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  region?: string | null;
  postcode?: string | null;
  country?: string | null;
  accessNotes?: string | null;
  inductionRequired?: boolean;
  supplyVoltage?: string | null;
  notes?: string | null;
}

export async function addSite(
  userId: string,
  clientId: string,
  input: SiteInput,
): Promise<{ id: string } | null> {
  if (!(await ownsClient(userId, clientId))) return null;
  const [row] = await db()
    .insert(clientSites)
    .values({ ...input, userId, clientId })
    .returning({ id: clientSites.id });
  return row ?? null;
}

export async function updateSite(
  userId: string,
  id: string,
  input: Partial<SiteInput>,
): Promise<boolean> {
  const result = await db()
    .update(clientSites)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(clientSites.id, id), eq(clientSites.userId, userId)))
    .returning({ id: clientSites.id });
  return result.length > 0;
}

export async function deleteSite(userId: string, id: string): Promise<boolean> {
  const result = await db()
    .delete(clientSites)
    .where(and(eq(clientSites.id, id), eq(clientSites.userId, userId)))
    .returning({ id: clientSites.id });
  return result.length > 0;
}

/* ─────────────────────────── standards ─────────────────────────── */

export async function getStandards(
  userId: string,
  clientId: string,
): Promise<ClientStandards | null> {
  const [row] = await db()
    .select()
    .from(clientStandards)
    .where(and(eq(clientStandards.clientId, clientId), eq(clientStandards.userId, userId)))
    .limit(1);
  return row ?? null;
}

export type StandardsInput = Partial<Omit<ClientStandards, "clientId" | "userId" | "updatedAt">>;

/**
 * Write the standards, creating the row on first save.
 *
 * One row per client, so this is an upsert rather than a create and an update.
 * A client that has never had its standards written has no row at all, which is
 * the honest representation of "nobody has recorded these yet" and reads
 * differently from a row full of empty strings.
 */
export async function saveStandards(
  userId: string,
  clientId: string,
  input: StandardsInput,
): Promise<boolean> {
  if (!(await ownsClient(userId, clientId))) return false;
  await db()
    .insert(clientStandards)
    .values({ ...input, clientId, userId })
    .onConflictDoUpdate({
      target: clientStandards.clientId,
      set: { ...input, updatedAt: new Date() },
    });
  return true;
}

/**
 * Whether a client has recorded anything worth carrying onto a job.
 *
 * Used to decide whether to show the standards on a project rather than an
 * empty panel. A row that exists but is entirely blank counts as nothing.
 */
export function hasStandards(s: ClientStandards | null): boolean {
  if (!s) return false;
  return [
    s.tagConvention,
    s.tagPattern,
    s.drawingNumbering,
    s.preferredPlc,
    s.preferredHmi,
    s.preferredDrive,
    s.hmiConvention,
    s.alarmConvention,
    s.documentRequirements,
    s.notes,
  ].some((v) => typeof v === "string" && v.trim().length > 0);
}
