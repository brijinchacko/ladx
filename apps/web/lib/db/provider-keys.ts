import { and, eq } from "drizzle-orm";
import { fingerprint, maskKey, open, seal } from "../crypto/secrets";
import type { Credentials, ProviderKind } from "../providers";
import { db } from "./client";
import { providerKeys } from "./schema";

/**
 * Reading and writing the user's connected providers.
 *
 * One rule runs through this file: the plaintext key leaves here only through
 * `credentialsFor`, which is called on the server immediately before a provider
 * request. Nothing else returns it, and nothing logs it. Everything the UI
 * needs, which provider, which model, whether it still works, is available
 * without opening the envelope.
 */

export interface ConnectedProvider {
  id: string;
  kind: ProviderKind;
  masked: string;
  baseUrl: string | null;
  defaultModel: string | null;
  verifiedAt: Date | null;
  createdAt: Date;
}

/** Everything the settings screen shows. Never includes a secret. */
export async function listProviders(userId: string): Promise<ConnectedProvider[]> {
  const rows = await db()
    .select({
      id: providerKeys.id,
      kind: providerKeys.kind,
      masked: providerKeys.masked,
      baseUrl: providerKeys.baseUrl,
      defaultModel: providerKeys.defaultModel,
      verifiedAt: providerKeys.verifiedAt,
      createdAt: providerKeys.createdAt,
    })
    .from(providerKeys)
    .where(eq(providerKeys.userId, userId));

  return rows as ConnectedProvider[];
}

/**
 * Store or replace a key.
 *
 * Upsert on (user, kind) rather than insert: connecting a provider twice means
 * "use this one now", not "keep both". Two keys for one provider would need a
 * tie-break rule at every read, and there is no sensible rule.
 */
export async function saveProviderKey(params: {
  userId: string;
  kind: ProviderKind;
  apiKey: string;
  baseUrl?: string | null;
  defaultModel?: string | null;
  verified?: boolean;
}): Promise<void> {
  const key = params.apiKey.trim();
  const row = {
    userId: params.userId,
    kind: params.kind,
    masked: maskKey(key),
    fingerprint: fingerprint(key),
    secret: seal(key, params.userId),
    baseUrl: params.baseUrl ?? null,
    defaultModel: params.defaultModel ?? null,
    verifiedAt: params.verified ? new Date() : null,
    updatedAt: new Date(),
  };

  await db()
    .insert(providerKeys)
    .values(row)
    .onConflictDoUpdate({
      target: [providerKeys.userId, providerKeys.kind],
      set: {
        masked: row.masked,
        fingerprint: row.fingerprint,
        secret: row.secret,
        baseUrl: row.baseUrl,
        defaultModel: row.defaultModel,
        verifiedAt: row.verifiedAt,
        updatedAt: row.updatedAt,
      },
    });
}

export async function setDefaultModel(
  userId: string,
  kind: ProviderKind,
  model: string,
): Promise<void> {
  await db()
    .update(providerKeys)
    .set({ defaultModel: model, updatedAt: new Date() })
    .where(and(eq(providerKeys.userId, userId), eq(providerKeys.kind, kind)));
}

export async function deleteProviderKey(userId: string, kind: ProviderKind): Promise<void> {
  await db()
    .delete(providerKeys)
    .where(and(eq(providerKeys.userId, userId), eq(providerKeys.kind, kind)));
}

/**
 * The only path that produces a usable key.
 *
 * Server-side callers use this immediately before a provider request and do not
 * hold the result. Returns `null` rather than throwing when nothing is
 * connected, because "you have not connected a provider yet" is an ordinary
 * state with its own UI, not an error.
 */
export async function credentialsFor(
  userId: string,
  kind: ProviderKind,
): Promise<(Credentials & { defaultModel: string | null }) | null> {
  const [row] = await db()
    .select()
    .from(providerKeys)
    .where(and(eq(providerKeys.userId, userId), eq(providerKeys.kind, kind)))
    .limit(1);

  if (!row) return null;

  return {
    apiKey: open(row.secret, userId),
    baseUrl: row.baseUrl ?? undefined,
    defaultModel: row.defaultModel,
  };
}

/**
 * The provider a request should use when the caller did not name one.
 *
 * Preference order is deliberate: whichever the user last set a default model
 * on wins, because choosing a model is the clearest statement of intent
 * available. Failing that, the most recently connected.
 */
export async function preferredProvider(
  userId: string,
): Promise<{ kind: ProviderKind; defaultModel: string | null } | null> {
  const rows = await listProviders(userId);
  if (!rows.length) return null;

  const withModel = rows.filter((r) => r.defaultModel);
  const pool = withModel.length ? withModel : rows;
  const chosen = pool.reduce((latest, r) => (r.createdAt > latest.createdAt ? r : latest));

  return { kind: chosen.kind, defaultModel: chosen.defaultModel };
}
