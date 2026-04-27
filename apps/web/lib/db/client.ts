// Drizzle client. Lazily instantiated so the module can be imported without
// DATABASE_URL set (typecheck, build) — actual DB calls throw with a clear
// message instead.

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../env";
import { schema } from "./schema";

let cached: ReturnType<typeof drizzle> | null = null;

export function db() {
  if (cached) return cached;
  const url = env.requireDatabaseUrl();
  // Single connection per Lambda / Vercel instance; pool is one to keep
  // serverless-friendly. Edge runtime requires a different driver.
  const client = postgres(url, { prepare: false, max: 1 });
  cached = drizzle(client, { schema });
  return cached;
}

export { schema };
