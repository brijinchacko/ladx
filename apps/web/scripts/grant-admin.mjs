/**
 * Make somebody an administrator, or take it away.
 *
 *   node scripts/grant-admin.mjs you@example.com
 *   node scripts/grant-admin.mjs you@example.com --revoke
 *   node scripts/grant-admin.mjs --list
 *
 * A script rather than a setting, because the first administrator has to be
 * made by somebody with access to the server and there is nowhere else that
 * could come from. After the first one, the admin area can grant the rest.
 *
 * Reads DATABASE_URL from the environment, or from .env.local if it is there,
 * which is what makes it work the same on a laptop and on the server.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  for (const f of [".env.local", ".env"]) {
    try {
      const text = readFileSync(resolve(process.cwd(), f), "utf8");
      const line = text.split("\n").find((l) => l.startsWith("DATABASE_URL="));
      if (line)
        return line
          .slice("DATABASE_URL=".length)
          .trim()
          .replace(/^["']|["']$/g, "");
    } catch {
      // next candidate
    }
  }
  return null;
}

const url = databaseUrl();
if (!url) {
  console.error("No DATABASE_URL, in the environment or in .env.local.");
  process.exit(1);
}

const args = process.argv.slice(2);
const revoke = args.includes("--revoke");
const list = args.includes("--list");
const email = args.find((a) => !a.startsWith("--"));

const sql = postgres(url, { max: 1 });

try {
  if (list) {
    const rows = await sql`
      select email, role, created_at from users where role = 'admin' order by created_at
    `;
    if (rows.length === 0) {
      console.log("No administrators yet. Grant the first one with:");
      console.log("  node scripts/grant-admin.mjs you@example.com");
    } else {
      console.log(`${rows.length} administrator${rows.length === 1 ? "" : "s"}:`);
      for (const r of rows)
        console.log(`  ${r.email}  since ${r.created_at.toISOString().slice(0, 10)}`);
    }
    process.exit(0);
  }

  if (!email) {
    console.error("Usage: node scripts/grant-admin.mjs <email> [--revoke]");
    console.error("       node scripts/grant-admin.mjs --list");
    process.exit(1);
  }

  const role = revoke ? "user" : "admin";

  // Refusing to remove the last one here as well as in the API, because this
  // script is the thing somebody reaches for at two in the morning.
  if (revoke) {
    const [{ n }] = await sql`
      select count(*)::int as n from users where role = 'admin' and lower(email) <> lower(${email})
    `;
    if (n === 0) {
      console.error("That is the only administrator. Grant another one first.");
      process.exit(1);
    }
  }

  const rows = await sql`
    update users set role = ${role}, updated_at = now()
     where lower(email) = lower(${email})
     returning email, role
  `;

  if (rows.length === 0) {
    console.error(`No account with the address ${email}. Sign up first, then run this.`);
    process.exit(1);
  }

  await sql`
    insert into audit_log (actor, event, subject_id, payload)
    values ('script', ${revoke ? "admin_revoked" : "admin_granted"}, ${rows[0].email},
            ${sql.json({ via: "grant-admin.mjs" })})
  `;

  console.log(`${rows[0].email} is now ${rows[0].role}.`);
} finally {
  await sql.end();
}
