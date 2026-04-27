import type { Config } from "drizzle-kit";

export default {
  schema: "./lib/db/schema.ts",
  out: "./lib/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    // drizzle-kit reads this directly; we don't fail at import time so
    // `pnpm typecheck` works without DATABASE_URL.
    url: process.env.DATABASE_URL ?? "",
  },
} satisfies Config;
