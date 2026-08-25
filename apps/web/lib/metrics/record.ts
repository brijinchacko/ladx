/**
 * Folding a batch of counts into the daily totals.
 *
 * Upserts rather than inserts: the grain is one row per day, path and
 * signed-in flag, so a busy day is a handful of rows however many times it is
 * read. The statement adds in place rather than reading and writing back, so
 * two batches arriving at once cannot lose each other's numbers.
 */

import { db } from "@/lib/db/client";
import { siteHits, siteReferrers } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

export interface Batch {
  /** "path authed" to count, in the shape the middleware buffers. */
  hits: Record<string, number>;
  /** Referrer host to count. A host, never a full URL: a URL can carry a name. */
  referrers?: Record<string, number>;
}

/** Today, as the server sees it, in the form the date column wants. */
export function today(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function recordBatch(batch: Batch, day = today()): Promise<number> {
  const rows: { day: string; path: string; authed: boolean; count: number }[] = [];
  for (const [key, count] of Object.entries(batch.hits ?? {})) {
    if (!Number.isFinite(count) || count <= 0) continue;
    const sep = key.lastIndexOf(" ");
    if (sep === -1) continue;
    const path = key.slice(0, sep);
    if (!path.startsWith("/") || path.length > 512) continue;
    rows.push({ day, path, authed: key.slice(sep + 1) === "1", count: Math.min(count, 1_000_000) });
  }

  if (rows.length) {
    await db()
      .insert(siteHits)
      .values(rows)
      .onConflictDoUpdate({
        target: [siteHits.day, siteHits.path, siteHits.authed],
        set: { count: sql`${siteHits.count} + excluded.count` },
      });
  }

  const refs = Object.entries(batch.referrers ?? {})
    .filter(([host, n]) => host && host.length <= 253 && Number.isFinite(n) && n > 0)
    .map(([host, n]) => ({ day, host, count: Math.min(n, 1_000_000) }));

  if (refs.length) {
    await db()
      .insert(siteReferrers)
      .values(refs)
      .onConflictDoUpdate({
        target: [siteReferrers.day, siteReferrers.host],
        set: { count: sql`${siteReferrers.count} + excluded.count` },
      });
  }

  return rows.length + refs.length;
}
