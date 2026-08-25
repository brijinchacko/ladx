/**
 * Desktop licences.
 *
 * The rule the activation endpoint enforces, in one place so it cannot be
 * enforced two different ways:
 *
 *   a key must exist, hashed, in the licences table
 *   it must not be revoked, and must not have expired
 *   the first machine to activate it claims it; another machine is refused
 *
 * The last of those is the one that makes a key worth anything. Without it a
 * licence is a password that works everywhere it is pasted.
 *
 * `LADX_ACTIVATION_OPEN` exists for the period before any key has been issued,
 * so the desktop build keeps working on the machine it is being developed on.
 * It is off unless explicitly set, it is reported on the admin status page,
 * and every activation it lets through is recorded as such rather than as a
 * real one.
 */

import { randomBytes } from "node:crypto";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { db } from "@/lib/db/client";
import { licences } from "@/lib/db/schema";
import { and, desc, eq, isNull, or } from "drizzle-orm";

export type ActivationResult =
  | { ok: true; expiresAt: string | null; tier: string; open?: true }
  | { ok: false; reason: "unknown" | "revoked" | "expired" | "other_machine" | "closed" };

/** Whether accept-all mode is on. Deliberately explicit, never a default. */
export function activationIsOpen(): boolean {
  return process.env.LADX_ACTIVATION_OPEN === "1";
}

/**
 * A new key, in the shape a person has to read down a phone line.
 *
 * Crockford's alphabet: no I, L, O or U, so there is no way to confuse a one
 * with an I or a zero with an O, and no way to spell anything unfortunate.
 * Four groups of five is twenty characters, about a hundred bits, which is
 * far past guessable and still short enough to type.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function newLicenceKey(): string {
  const bytes = randomBytes(20);
  const chars = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join("");
  return `LADX-${chars.slice(0, 5)}-${chars.slice(5, 10)}-${chars.slice(10, 15)}-${chars.slice(15, 20)}`;
}

export function prefixOf(key: string): string {
  return key.slice(0, 10);
}

export async function issueLicence(input: {
  issuedTo: string;
  email?: string | null;
  note?: string | null;
  expiresAt?: Date | null;
}): Promise<{ id: string; key: string }> {
  const key = newLicenceKey();
  const [row] = await db()
    .insert(licences)
    .values({
      keyHash: await hashPassword(key),
      prefix: prefixOf(key),
      issuedTo: input.issuedTo,
      email: input.email ?? null,
      note: input.note ?? null,
      expiresAt: input.expiresAt ?? null,
    })
    .returning({ id: licences.id });
  if (!row) throw new Error("licence insert returned no row");
  // Shown once. There is no way to read it back, which is the point of storing
  // a hash, and the reason the admin page says so before it disappears.
  return { id: row.id, key };
}

/**
 * Check a key and claim it for a machine.
 *
 * Candidates are narrowed by prefix and then verified one at a time, because
 * the stored value is a hash and there is nothing to look up by. The prefix is
 * ten characters of a hundred-bit key, so in practice there is one candidate.
 */
export async function activate(input: {
  licenceKey: string;
  machineId: string;
  productVersion: string;
}): Promise<ActivationResult> {
  const rows = await db()
    .select()
    .from(licences)
    .where(eq(licences.prefix, prefixOf(input.licenceKey)))
    .orderBy(desc(licences.createdAt))
    .limit(8);

  for (const row of rows) {
    if (!(await verifyPassword(input.licenceKey, row.keyHash))) continue;

    if (row.revokedAt) return { ok: false, reason: "revoked" };
    if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
      return { ok: false, reason: "expired" };
    }
    if (row.machineId && row.machineId !== input.machineId) {
      return { ok: false, reason: "other_machine" };
    }

    await db()
      .update(licences)
      .set({
        machineId: row.machineId ?? input.machineId,
        activatedAt: row.activatedAt ?? new Date(),
        lastSeenAt: new Date(),
        productVersion: input.productVersion,
      })
      .where(eq(licences.id, row.id));

    return {
      ok: true,
      expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
      tier: "studio",
    };
  }

  if (activationIsOpen()) {
    // A year, so the machine it is being developed on keeps working, and
    // clearly marked so nobody mistakes this for a real licence.
    return {
      ok: true,
      expiresAt: new Date(Date.now() + 365 * 86_400_000).toISOString(),
      tier: "studio",
      open: true,
    };
  }

  return { ok: false, reason: "unknown" };
}

export async function listLicences() {
  return db()
    .select({
      id: licences.id,
      prefix: licences.prefix,
      issuedTo: licences.issuedTo,
      email: licences.email,
      note: licences.note,
      machineId: licences.machineId,
      activatedAt: licences.activatedAt,
      lastSeenAt: licences.lastSeenAt,
      productVersion: licences.productVersion,
      expiresAt: licences.expiresAt,
      revokedAt: licences.revokedAt,
      createdAt: licences.createdAt,
    })
    .from(licences)
    .orderBy(desc(licences.createdAt))
    .limit(200);
}

export async function setRevoked(id: string, revoked: boolean): Promise<void> {
  await db()
    .update(licences)
    .set({ revokedAt: revoked ? new Date() : null })
    .where(eq(licences.id, id));
}

/**
 * Let a key move to a new machine.
 *
 * Laptops get replaced, and a licence that cannot follow its owner to a new
 * one is a support ticket rather than a security feature. Clearing the machine
 * lets the next activation claim it.
 */
export async function clearMachine(id: string): Promise<void> {
  await db()
    .update(licences)
    .set({ machineId: null, activatedAt: null })
    .where(eq(licences.id, id));
}

/** How many keys are live, for the status page. */
export async function licenceCounts() {
  const rows = await db()
    .select({ id: licences.id, revokedAt: licences.revokedAt, machineId: licences.machineId })
    .from(licences);
  return {
    total: rows.length,
    active: rows.filter((r) => !r.revokedAt).length,
    activated: rows.filter((r) => r.machineId).length,
  };
}

export { and, isNull, or };
