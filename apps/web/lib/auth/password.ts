// bcrypt password hashing. Cost factor 12 — slow enough to defeat brute
// force, fast enough not to block the request thread on hot signup paths.
// If you ever migrate to argon2id, the password_hash column is a text
// field so you can prefix-detect the algo (`$2b$` vs `$argon2id$`).

import bcrypt from "bcryptjs";

const COST = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
