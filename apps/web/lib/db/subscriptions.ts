// Helpers for the per-user subscription row. Every authenticated user
// has either zero (treated as implicit "free") or one row in the
// `subscriptions` table; the unique constraint on `user_id` enforces it.

import { eq } from "drizzle-orm";
import { db } from "./client";
import { type Subscription, subscriptions } from "./schema";

export type Tier = "free" | "pro" | "site" | "enterprise";

export async function getSubscription(userId: string): Promise<Subscription | null> {
  const rows = await db()
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

export async function ensureFreeSubscription(userId: string): Promise<Subscription> {
  const existing = await getSubscription(userId);
  if (existing) return existing;
  const [row] = await db()
    .insert(subscriptions)
    .values({ userId, tier: "free", status: "active" })
    .returning();
  if (!row) throw new Error("subscription insert returned no row");
  return row;
}

export async function incrementPromptCount(userId: string): Promise<void> {
  const sub = await getSubscription(userId);
  if (!sub) return;
  await db()
    .update(subscriptions)
    .set({
      promptsUsedThisPeriod: sub.promptsUsedThisPeriod + 1,
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.userId, userId));
}

export const FREE_PROMPT_QUOTA = 50;

export interface QuotaState {
  tier: Tier;
  used: number;
  limit: number | null;
  remaining: number | null;
  blocked: boolean;
}

export async function checkQuota(userId: string): Promise<QuotaState> {
  const sub = await ensureFreeSubscription(userId);
  if (sub.tier === "pro" || sub.tier === "site" || sub.tier === "enterprise") {
    return {
      tier: sub.tier,
      used: sub.promptsUsedThisPeriod,
      limit: null,
      remaining: null,
      blocked: false,
    };
  }
  return {
    tier: "free",
    used: sub.promptsUsedThisPeriod,
    limit: FREE_PROMPT_QUOTA,
    remaining: Math.max(0, FREE_PROMPT_QUOTA - sub.promptsUsedThisPeriod),
    blocked: sub.promptsUsedThisPeriod >= FREE_PROMPT_QUOTA,
  };
}
