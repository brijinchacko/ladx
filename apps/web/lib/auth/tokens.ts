// One-shot tokens for password reset, magic-link sign-in, etc.
//
// Security model:
// - Plaintext token = 32 random bytes hex-encoded (64 chars), generated
//   server-side and emailed to the user. Never logged, never persisted.
// - DB stores a bcrypt hash of the plaintext (cost 10 — these are
//   short-lived, so we don't need cost 12 like passwords). A leaked DB
//   thus exposes only inert hashes; live tokens still require email.
// - Tokens are single-use: `consumeToken` marks `used_at` atomically.
// - Expired or used tokens are rejected during consume.

import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "../db/client";
import { type AuthToken, authTokens } from "../db/schema";

const TOKEN_BYTES = 32;
const TOKEN_HASH_COST = 10;

export type AuthTokenKind = "password_reset" | "magic_link" | "email_verify";

export interface IssuedToken {
  /** The plaintext token to embed in the email link. Only handed back once. */
  plaintext: string;
  /** The DB row id (NOT the token). */
  id: string;
}

export async function createToken(opts: {
  userId: string;
  kind: AuthTokenKind;
  ttlSeconds: number;
}): Promise<IssuedToken> {
  const plaintext = randomBytes(TOKEN_BYTES).toString("hex");
  const tokenHash = await bcrypt.hash(plaintext, TOKEN_HASH_COST);
  const expiresAt = new Date(Date.now() + opts.ttlSeconds * 1000);

  const [row] = await db()
    .insert(authTokens)
    .values({
      userId: opts.userId,
      kind: opts.kind,
      tokenHash,
      expiresAt,
    })
    .returning();
  if (!row) throw new Error("auth token insert returned no row");

  return { plaintext, id: row.id };
}

/**
 * Validate a plaintext token of the given kind, mark it used, and return
 * the row. Returns null on miss / expiry / already-used.
 *
 * NOTE: bcrypt-hashed tokens can't be looked up by hash, so we have to
 * scan the user's outstanding tokens of this kind. Per-user fanout is
 * tiny (typically 1-2 active tokens) so this is fine.
 */
export async function consumeToken(opts: {
  userId: string;
  kind: AuthTokenKind;
  plaintext: string;
}): Promise<AuthToken | null> {
  const candidates = await db()
    .select()
    .from(authTokens)
    .where(
      and(
        eq(authTokens.userId, opts.userId),
        eq(authTokens.kind, opts.kind),
        isNull(authTokens.usedAt),
        gt(authTokens.expiresAt, new Date()),
      ),
    );

  for (const row of candidates) {
    const ok = await bcrypt.compare(opts.plaintext, row.tokenHash);
    if (!ok) continue;

    // Mark used atomically — the WHERE includes used_at IS NULL so a
    // concurrent consume would only succeed once.
    const [updated] = await db()
      .update(authTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(authTokens.id, row.id), isNull(authTokens.usedAt)))
      .returning();
    return updated ?? null;
  }
  return null;
}

/**
 * Convenience: validate without knowing the user id ahead of time.
 * Used by magic-link consume where the URL contains only the token.
 * We scan ALL active tokens of the given kind — to keep that bounded
 * we delete expired tokens periodically (cron / on-access).
 */
export async function consumeTokenByPlaintext(opts: {
  kind: AuthTokenKind;
  plaintext: string;
}): Promise<AuthToken | null> {
  const candidates = await db()
    .select()
    .from(authTokens)
    .where(
      and(
        eq(authTokens.kind, opts.kind),
        isNull(authTokens.usedAt),
        gt(authTokens.expiresAt, new Date()),
      ),
    );

  for (const row of candidates) {
    const ok = await bcrypt.compare(opts.plaintext, row.tokenHash);
    if (!ok) continue;
    const [updated] = await db()
      .update(authTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(authTokens.id, row.id), isNull(authTokens.usedAt)))
      .returning();
    return updated ?? null;
  }
  return null;
}
